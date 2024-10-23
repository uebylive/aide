/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as net from 'net';
import * as vscode from 'vscode';

import { AnswerSplitOnNewLineAccumulatorStreaming, StreamProcessor } from '../../chatState/convertStreamToMessage';
import { applyEdits, applyEditsDirectly, } from '../../server/applyEdits';
import { RecentEditsRetriever } from '../../server/editedFiles';
import { handleRequest } from '../../server/requestHandler';
import { EditedCodeStreamingRequest, SideCarAgentEvent, SidecarApplyEditsRequest, SidecarContextEvent, SidecarUndoPlanStep } from '../../server/types';
import { RepoRef, SideCarClient } from '../../sidecar/client';
import { getUserId } from '../../utilities/uniqueId';
import { ProjectContext } from '../../utilities/workspaceContext';

/**
 * Stores the necessary identifiers required for identifying a response stream
 */
interface ResponseStreamIdentifier {
	sessionId: string;
	exchangeId: string;
}

class AideResponseStreamCollection {
	private responseStreamCollection: Map<string, vscode.AideAgentEventSenderResponse> = new Map();

	constructor(private extensionContext: vscode.ExtensionContext, private sidecarClient: SideCarClient, private aideAgentSessionProvider: AideAgentSessionProvider) {
		this.extensionContext = extensionContext;
		this.sidecarClient = sidecarClient;

	}
	getKey(responseStreamIdentifier: ResponseStreamIdentifier): string {
		return `${responseStreamIdentifier.sessionId}-${responseStreamIdentifier.exchangeId}`;
	}

	addResponseStream(responseStreamIdentifier: ResponseStreamIdentifier, responseStream: vscode.AideAgentEventSenderResponse) {
		this.extensionContext.subscriptions.push(responseStream.token.onCancellationRequested(() => {
			console.log('responseStream::token_cancelled');
			// over here we get the stream of events from the cancellation
			// we need to send it over on the stream as usual so we can work on it
			const responseStreamAnswer = this.sidecarClient.cancelRunningEvent(responseStreamIdentifier.sessionId, responseStreamIdentifier.exchangeId);
			this.aideAgentSessionProvider.reportAgentEventsToChat(true, responseStreamAnswer);
		}));
		this.responseStreamCollection.set(this.getKey(responseStreamIdentifier), responseStream);
	}

	getResponseStream(responseStreamIdentifier: ResponseStreamIdentifier): vscode.AideAgentEventSenderResponse | undefined {
		return this.responseStreamCollection.get(this.getKey(responseStreamIdentifier));
	}

	removeResponseStream(responseStreamIdentifer: ResponseStreamIdentifier) {
		this.responseStreamCollection.delete(this.getKey(responseStreamIdentifer));
	}
}


export class AideAgentSessionProvider implements vscode.AideSessionParticipant {
	private aideAgent: vscode.AideSessionAgent;

	editorUrl: string | undefined;
	private iterationEdits = new vscode.WorkspaceEdit();
	private requestHandler: http.Server | null = null;
	private editsMap = new Map();
	private eventQueue: vscode.AideAgentRequest[] = [];
	private openResponseStream: vscode.AideAgentResponseStream | undefined;
	private processingEvents: Map<string, boolean> = new Map();
	private responseStreamCollection: AideResponseStreamCollection;
	private sessionId: string | undefined;
	// this is a hack to test the theory that we can keep snapshots and make
	// that work
	private editCounter = 0;

	private async isPortOpen(port: number): Promise<boolean> {
		return new Promise((resolve, _) => {
			const s = net.createServer();
			s.once('error', (err) => {
				s.close();
				// @ts-ignore
				if (err['code'] === 'EADDRINUSE') {
					resolve(false);
				} else {
					resolve(false); // or throw error!!
					// reject(err);
				}
			});
			s.once('listening', () => {
				resolve(true);
				s.close();
			});
			s.listen(port);
		});
	}

	private async getNextOpenPort(startFrom: number = 42427) {
		let openPort: number | null = null;
		while (startFrom < 65535 || !!openPort) {
			if (await this.isPortOpen(startFrom)) {
				openPort = startFrom;
				break;
			}
			startFrom++;
		}
		return openPort;
	}

	constructor(
		private currentRepoRef: RepoRef,
		private projectContext: ProjectContext,
		private sidecarClient: SideCarClient,
		recentEditsRetriever: RecentEditsRetriever,
		extensionContext: vscode.ExtensionContext,
	) {
		this.requestHandler = http.createServer(
			handleRequest(
				this.provideEdit.bind(this),
				this.provideEditStreamed.bind(this),
				this.newExchangeIdForSession.bind(this),
				recentEditsRetriever.retrieveSidecar.bind(recentEditsRetriever),
				this.undoToCheckpoint.bind(this),
			)
		);
		this.getNextOpenPort().then((port) => {
			if (port === null) {
				throw new Error('Could not find an open port');
			}

			// can still grab it by listenting to port 0
			this.requestHandler?.listen(port);
			const editorUrl = `http://localhost:${port}`;
			console.log('editorUrl', editorUrl);
			this.editorUrl = editorUrl;
		});

		this.aideAgent = vscode.aideAgent.createChatParticipant('aide', {
			newSession: this.newSession.bind(this),
			handleEvent: this.handleEvent.bind(this),
			handleExchangeUserAction: this.handleExchangeUserAction.bind(this),
		});
		this.aideAgent.iconPath = vscode.Uri.joinPath(vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionUri ?? vscode.Uri.parse(''), 'assets', 'aide-agent.png');
		this.aideAgent.requester = {
			name: getUserId(),
			icon: vscode.Uri.joinPath(vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionUri ?? vscode.Uri.parse(''), 'assets', 'aide-user.png')
		};
		// our collection of active response streams for exchanges which are still running
		// apparantaly this also works??? crazy the world of js
		this.responseStreamCollection = new AideResponseStreamCollection(extensionContext, sidecarClient, this);
		this.aideAgent.supportIssueReporting = false;
		this.aideAgent.welcomeMessageProvider = {
			provideWelcomeMessage: async () => {
				return [
					'Hi, I\'m **Aide**, your personal coding assistant! I can find, understand, explain, debug or write code for you.',
				];
			}
		};
	}

	async sendContextRecording(events: SidecarContextEvent[]) {
		await this.sidecarClient.sendContextRecording(events, this.editorUrl);
	}

	async undoToCheckpoint(request: SidecarUndoPlanStep): Promise<{
		success: boolean;
	}> {
		const exchangeId = request.exchange_id;
		const sessionId = request.session_id;
		const planStep = request.index;
		const responseStream = this.responseStreamCollection.getResponseStream({
			sessionId,
			exchangeId,
		});
		if (responseStream === undefined) {
			return {
				success: false,
			};
		}
		let label = exchangeId;
		if (planStep !== null) {
			label = `${exchangeId}::${planStep}`;
		}

		// This creates a very special code edit which is handled by the aideAgentCodeEditingService
		// where we intercept this edit and instead do a global rollback
		const edit = new vscode.WorkspaceEdit();
		edit.delete(vscode.Uri.file('/undoCheck'), new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), {
			label,
			needsConfirmation: false,
		});
		responseStream.stream.codeEdit(edit);
		return {
			success: true,
		};
	}

	async newExchangeIdForSession(sessionId: string): Promise<{
		exchange_id: string | undefined;
	}> {
		// TODO(skcd): Figure out when the close the exchange? This is not really
		// well understood but we should have an explicit way to do that
		const response = await this.aideAgent.initResponse(sessionId);
		if (response !== undefined) {
			console.log('newExchangeCreated', sessionId, response.exchangeId);
			this.responseStreamCollection.addResponseStream({
				sessionId,
				exchangeId: response.exchangeId,
			}, response);
		}
		return {
			exchange_id: response?.exchangeId,
		};
	}

	async provideEditStreamed(request: EditedCodeStreamingRequest): Promise<{
		fs_file_path: string;
		success: boolean;
	}> {
		// how does the response stream look over here
		const responseStream = this.responseStreamCollection.getResponseStream({
			exchangeId: request.exchange_id,
			sessionId: request.session_id,
		});

		// This is our uniqueEditId which we are using to tag the edits and make
		// sure that we can roll-back if required on the undo-stack
		let uniqueEditId = request.exchange_id;
		if (request.plan_step_id) {
			uniqueEditId = `${uniqueEditId}::${request.plan_step_id}`;
		}
		if (!request.apply_directly && !this.openResponseStream && !responseStream) {
			return {
				fs_file_path: '',
				success: false,
			};
		}
		const editStreamEvent = request;
		const fileDocument = editStreamEvent.fs_file_path;
		if ('Start' === editStreamEvent.event) {
			const timeNow = Date.now();
			const document = await vscode.workspace.openTextDocument(fileDocument);
			if (document === undefined || document === null) {
				return {
					fs_file_path: '',
					success: false,
				};
			}
			console.log('editsStreamed::content', timeNow, document.getText());
			const documentLines = document.getText().split(/\r\n|\r|\n/g);
			console.log('editStreaming.start', editStreamEvent.fs_file_path);
			console.log(editStreamEvent.range);
			console.log(documentLines);
			this.editsMap.set(editStreamEvent.edit_request_id, {
				answerSplitter: new AnswerSplitOnNewLineAccumulatorStreaming(),
				// Now here we want to pass a proper id as we want to make sure that
				// things work out so the edit event should send some metadata with the
				// edits so we can keep track of it and use it, but for now we go
				// with the iteration numbers on the aideagentsessionprovider itself
				streamProcessor: new StreamProcessor(
					responseStream?.stream!,
					documentLines,
					undefined,
					vscode.Uri.file(editStreamEvent.fs_file_path),
					editStreamEvent.range,
					null,
					this.iterationEdits,
					editStreamEvent.apply_directly,
					// send an id over here which is unique to this run
					// over here we want to send the plan-id or a unique reference
					// which tracks this edit in our system so we can track it as a timeline
					// for the editor
					uniqueEditId,
				),
			});
		} else if ('End' === editStreamEvent.event) {
			// drain the lines which might be still present
			const editsManager = this.editsMap.get(editStreamEvent.edit_request_id);
			while (true) {
				const currentLine = editsManager.answerSplitter.getLine();
				if (currentLine === null) {
					break;
				}
				await editsManager.streamProcessor.processLine(currentLine);
			}
			editsManager.streamProcessor.cleanup();

			await vscode.workspace.save(vscode.Uri.file(editStreamEvent.fs_file_path)); // save files upon stream completion
			console.log('provideEditsStreamed::finished', editStreamEvent.fs_file_path);
			// delete this from our map
			this.editsMap.delete(editStreamEvent.edit_request_id);
			// incrementing the counter over here
			this.editCounter = this.editCounter + 1;
			// we have the updated code (we know this will be always present, the types are a bit meh)
		} else if (editStreamEvent.event.Delta) {
			const editsManager = this.editsMap.get(editStreamEvent.edit_request_id);
			if (editsManager !== undefined) {
				editsManager.answerSplitter.addDelta(editStreamEvent.event.Delta);
				while (true) {
					const currentLine = editsManager.answerSplitter.getLine();
					if (currentLine === null) {
						break;
					}
					await editsManager.streamProcessor.processLine(currentLine);
				}
			}
		}
		return {
			fs_file_path: '',
			success: true,
		};
	}

	async provideEdit(request: SidecarApplyEditsRequest): Promise<{
		fs_file_path: string;
		success: boolean;
	}> {
		if (request.apply_directly) {
			applyEditsDirectly(request);
			return {
				fs_file_path: request.fs_file_path,
				success: true,
			};
		}
		if (!this.openResponseStream) {
			console.log('returning early over here');
			return {
				fs_file_path: request.fs_file_path,
				success: true,
			};
		}
		const response = await applyEdits(request, this.openResponseStream, this.iterationEdits);
		return response;
	}

	newSession(sessionId: string): void {
		this.sessionId = sessionId;
	}

	/**
	 * TODO(codestory): We want to get this exchange feedback on each exchange
	 * either automagically or when the user invokes it
	 * Its the responsibility of the editor for now to make sure that the feedback
	 * is give, the sidecar should not close the exchange until we have this feedback
	 * this also updates the feedback on the sidecar side so we can tell the agent if its
	 * chagnes were accepted or not
	 */
	handleExchangeUserAction(sessionId: string, exchangeId: string, action: vscode.AideSessionExchangeUserAction): void {
		// we ping the sidecar over here telling it about the state of the edits after
		// the user has reacted to it appropriately
		console.log('handleExchangeUserAction', sessionId, exchangeId, action);
		const editorUrl = this.editorUrl;
		let isAccepted = false;
		if (action === vscode.AideSessionExchangeUserAction.AcceptAll) {
			isAccepted = true;
		}
		if (editorUrl) {
			// TODO(skcd): Not sure if an async stream like this works, but considering
			// js/ts this should be okay from what I remember, pending futures do not
			// get cleaned up via GC
			const responseStream = this.sidecarClient.userFeedbackOnExchange(sessionId, exchangeId, editorUrl, isAccepted);
			this.reportAgentEventsToChat(true, responseStream);
		}
	}

	handleEvent(event: vscode.AideAgentRequest): void {
		this.eventQueue.push(event);
		if (this.sessionId && !this.processingEvents.has(event.id)) {
			this.processingEvents.set(event.id, true);
			this.processEvent(event);
		}
	}

	private async processEvent(event: vscode.AideAgentRequest): Promise<void> {
		if (!this.sessionId || !this.editorUrl) {
			return;
		}
		// New flow migration
		if (event.mode === vscode.AideAgentMode.Chat || event.mode === vscode.AideAgentMode.Edit || event.mode === vscode.AideAgentMode.Plan) {
			await this.streamResponse(event, this.sessionId, this.editorUrl);
			return;
		}
	}

	/**
	 * A uniform reply stream over here which transparently handles any kind of request
	 * type, since on the sidecar side we are taking care of streaming the right thing
	 * depending on the agent mode
	 */
	private async streamResponse(event: vscode.AideAgentRequest, sessionId: string, editorUrl: string) {
		const prompt = event.prompt;
		const exchangeIdForEvent = event.id;
		const agentMode = event.mode;
		const variables = event.references;
		if (event.mode === vscode.AideAgentMode.Chat) {
			const responseStream = this.sidecarClient.agentSessionChat(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels);
			await this.reportAgentEventsToChat(true, responseStream);
		}
		// Now lets try to handle the edit event first
		// there are 2 kinds of edit events:
		// - anchored and agentic events
		// if its anchored, then we have the sscope as selection
		// if its selection scope then its agentic
		if (event.mode === vscode.AideAgentMode.Edit) {
			if (event.scope === vscode.AideAgentScope.Selection) {
				const responseStream = await this.sidecarClient.agentSessionAnchoredEdit(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels);
				await this.reportAgentEventsToChat(true, responseStream);
			} else {
				const isWholeCodebase = event.scope === vscode.AideAgentScope.Codebase;
				const responseStream = await this.sidecarClient.agentSessionPlanStep(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, isWholeCodebase);
				await this.reportAgentEventsToChat(true, responseStream);
			}
		}

		// For plan generation we have 2 things which can happen:
		// plan gets generated incrementally or in an instant depending on people using
		// o1 or not
		// once we have a step of the plan we should stream it along with the edits of the plan
		// and keep doing that until we are done completely
		if (event.mode === vscode.AideAgentMode.Plan) {
			const responseStream = await this.sidecarClient.agentSessionPlanStep(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels, false);
			await this.reportAgentEventsToChat(true, responseStream);
		}
	}

	/**
	 * We might be streaming back chat events or something else on the exchange we are
	 * interested in, so we want to close the stream when we want to
	 */
	async reportAgentEventsToChat(
		editMode: boolean,
		stream: AsyncIterableIterator<SideCarAgentEvent>,
	): Promise<void> {
		// const editsMap = new Map();
		const asyncIterable = {
			[Symbol.asyncIterator]: () => stream
		};

		for await (const event of asyncIterable) {
			// now we ping the sidecar that the probing needs to stop

			if ('keep_alive' in event) {
				continue;
			}

			if ('session_id' in event && 'started' in event) {
				continue;
			}

			if ('done' in event) {
				continue;
			}

			const sessionId = event.request_id;
			const exchangeId = event.exchange_id;
			const responseStream = this.responseStreamCollection.getResponseStream({
				sessionId,
				exchangeId,
			});
			if (responseStream === undefined) {
				console.log(event);
				console.log('resonseStreamNotFound::ExchangeEvent::ExchangeEvent', exchangeId, sessionId);
				continue;
			}

			if (event.event.FrameworkEvent) {
				if (event.event.FrameworkEvent.InitialSearchSymbols) {
					// const initialSearchSymbolInformation = event.event.FrameworkEvent.InitialSearchSymbols.symbols.map((item) => {
					// 	return {
					// 		symbolName: item.symbol_name,
					// 		uri: vscode.Uri.file(item.fs_file_path),
					// 		isNew: item.is_new,
					// 		thinking: item.thinking,
					// 	};
					// });
					// response.initialSearchSymbols(initialSearchSymbolInformation);
				} else if (event.event.FrameworkEvent.RepoMapGenerationStart) {
					// response.repoMapGeneration(false);
				} else if (event.event.FrameworkEvent.RepoMapGenerationFinished) {
					// response.repoMapGeneration(true);
				} else if (event.event.FrameworkEvent.LongContextSearchStart) {
					// response.longContextSearch(false);
				} else if (event.event.FrameworkEvent.LongContextSearchFinished) {
					// response.longContextSearch(true);
				} else if (event.event.FrameworkEvent.OpenFile) {
					// const filePath = event.event.FrameworkEvent.OpenFile.fs_file_path;
					// if (filePath) {
					// 	response.reference(vscode.Uri.file(filePath));
					// }
				} else if (event.event.FrameworkEvent.CodeIterationFinished) {
					// response.codeIterationFinished({ edits: iterationEdits });
				} else if (event.event.FrameworkEvent.ReferenceFound) {
					// response.referenceFound({ references: event.event.FrameworkEvent.ReferenceFound });
				} else if (event.event.FrameworkEvent.RelevantReference) {
					// const ref = event.event.FrameworkEvent.RelevantReference;
					// response.relevantReference({
					// 	uri: vscode.Uri.file(ref.fs_file_path),
					// 	symbolName: ref.symbol_name,
					// 	reason: ref.reason,
					// });
				} else if (event.event.FrameworkEvent.GroupedReferences) {
					const groupedRefs = event.event.FrameworkEvent.GroupedReferences;
					const followups: { [key: string]: { symbolName: string; uri: vscode.Uri }[] } = {};
					for (const [reason, references] of Object.entries(groupedRefs)) {
						followups[reason] = references.map((ref) => {
							return {
								symbolName: ref.symbol_name,
								uri: vscode.Uri.file(ref.fs_file_path),
							};
						});
					}
					// response.followups(followups);
				} else if (event.event.FrameworkEvent.SearchIteration) {
					// console.log(event.event.FrameworkEvent.SearchIteration);
				} else if (event.event.FrameworkEvent.AgenticTopLevelThinking) {
					// TODO(skcd): The agent thinking event is over here, not streamed
					// but it can get the job done
					console.log(event.event.FrameworkEvent.AgenticTopLevelThinking);
				} else if (event.event.FrameworkEvent.AgenticSymbolLevelThinking) {
					// TODO(skcd): The agent symbol level thinking is here, not streamed
					// but we can hook into it for information and context
					console.log(event.event.FrameworkEvent.AgenticSymbolLevelThinking);
				}
			} else if (event.event.SymbolEvent) {
				const symbolEvent = event.event.SymbolEvent.event;
				const symbolEventKeys = Object.keys(symbolEvent);
				if (symbolEventKeys.length === 0) {
					continue;
				}
				const symbolEventKey = symbolEventKeys[0] as keyof typeof symbolEvent;
				// If this is a symbol event then we have to make sure that we are getting the probe request over here
				if (!editMode && symbolEventKey === 'Probe' && symbolEvent.Probe !== undefined) {
					// response.breakdown({
					// 	reference: {
					// 		uri: vscode.Uri.file(symbolEvent.Probe.symbol_identifier.fs_file_path ?? 'symbol_not_found'),
					// 		name: symbolEvent.Probe.symbol_identifier.symbol_name,
					// 	},
					// 	query: new vscode.MarkdownString(symbolEvent.Probe.probe_request)
					// });
				}
			} else if (event.event.SymbolEventSubStep) {
				const { symbol_identifier, event: symbolEventSubStep } = event.event.SymbolEventSubStep;

				if (symbolEventSubStep.GoToDefinition) {
					if (!symbol_identifier.fs_file_path) {
						continue;
					}
					// const goToDefinition = symbolEventSubStep.GoToDefinition;
					// const uri = vscode.Uri.file(goToDefinition.fs_file_path);
					// const startPosition = new vscode.Position(goToDefinition.range.startPosition.line, goToDefinition.range.startPosition.character);
					// const endPosition = new vscode.Position(goToDefinition.range.endPosition.line, goToDefinition.range.endPosition.character);
					// const _range = new vscode.Range(startPosition, endPosition);
					// response.location({ uri, range, name: symbol_identifier.symbol_name, thinking: goToDefinition.thinking });
					continue;
				} else if (symbolEventSubStep.Edit) {
					if (!symbol_identifier.fs_file_path) {
						continue;
					}
					const editEvent = symbolEventSubStep.Edit;

					// UX handle for code correction tool usage - consider using
					if (editEvent.CodeCorrectionTool) { }

					// TODO(skcd): We have to show this properly over here since
					// even with the search and replace blocks we do want to show it
					// to the user
					if (editEvent.ThinkingForEdit) {
						// TODO(@skcd42): This event currently gets sent multiple times, and doesn't contain the text we'd ideally like to show the user.
						// It also seems to contain the search/replace block in the text, which we don't want to show.
						// response.markdown(new vscode.MarkdownString(editEvent.ThinkingForEdit.thinking));
					}
					if (editEvent.RangeSelectionForEdit) {
						// response.breakdown({
						// 	reference: {
						// 		uri: vscode.Uri.file(symbol_identifier.fs_file_path),
						// 		name: symbol_identifier.symbol_name,
						// 	}
						// });
					} else if (editEvent.EditCodeStreaming) {
						// scraped out over here, we do not need to react to this
						// event anymore
					}
				} else if (symbolEventSubStep.Probe) {
					if (!symbol_identifier.fs_file_path) {
						continue;
					}
					const probeSubStep = symbolEventSubStep.Probe;
					const probeRequestKeys = Object.keys(probeSubStep) as (keyof typeof symbolEventSubStep.Probe)[];
					if (!symbol_identifier.fs_file_path || probeRequestKeys.length === 0) {
						continue;
					}

					const subStepType = probeRequestKeys[0];
					if (!editMode && subStepType === 'ProbeAnswer' && probeSubStep.ProbeAnswer !== undefined) {
						// const probeAnswer = probeSubStep.ProbeAnswer;
						// response.breakdown({
						// 	reference: {
						// 		uri: vscode.Uri.file(symbol_identifier.fs_file_path),
						// 		name: symbol_identifier.symbol_name
						// 	},
						// 	response: new vscode.MarkdownString(probeAnswer)
						// });
					}
				}
			} else if (event.event.RequestEvent) {
				// const { ProbeFinished } = event.event.RequestEvent;
				// if (!ProbeFinished) {
				// 	continue;
				// }

				// const { reply } = ProbeFinished;
				// if (reply === null) {
				// 	continue;
				// }

				// // The sidecar currently sends '<symbolName> at <fileName>' at the start of the response. Remove it.
				// const match = reply.match(pattern);
				// if (match) {
				// 	const suffix = match[2].trim();
				// 	response.markdown(suffix);
				// } else {
				// 	response.markdown(reply);
				// }

				// break;
			} else if (event.event.EditRequestFinished) {
				// break;
			} else if (event.event.ChatEvent) {
				// responses to the chat
				const sessionId = event.request_id;
				const exchangeId = event.exchange_id;
				const responseStream = this.responseStreamCollection.getResponseStream({ sessionId, exchangeId });
				if (responseStream === undefined) {
					console.log('responseStreamNotFound::ChatEvent', exchangeId, sessionId);
				}

				const { delta } = event.event.ChatEvent;

				if (delta !== null) {
					responseStream?.stream.markdown(delta);
				}
			} else if (event.event.PlanEvent) {
				const sessionId = event.request_id;
				const exchangeId = event.exchange_id;
				const responseStream = this.responseStreamCollection.getResponseStream({
					sessionId, exchangeId,
				});
				// we also have a plan step description updated event which we are going
				// to handle on the review panel
				if (event.event.PlanEvent.PlanStepTitleAdded) {
					responseStream?.stream.planInfo({
						exchangeId,
						sessionId,
						isStale: false,
						state: 'started',
						description: event.event.PlanEvent.PlanStepTitleAdded.title,
					});
					// TODO(codestory): Remove this soon after cause we will just rely
					// on the title for now to provide updates to the side panel
					responseStream?.stream.step({
						description: '',
						index: event.event.PlanEvent.PlanStepTitleAdded.index,
						sessionId,
						exchangeId: event.event.PlanEvent.PlanStepTitleAdded.exchange_id,
						isLast: false,
						title: event.event.PlanEvent.PlanStepTitleAdded.title,
					});
				}
				if (event.event.PlanEvent.PlanStepCompleteAdded) {
					responseStream?.stream.step({
						description: event.event.PlanEvent.PlanStepCompleteAdded.description,
						index: event.event.PlanEvent.PlanStepCompleteAdded.index,
						sessionId,
						exchangeId: event.event.PlanEvent.PlanStepCompleteAdded.exchange_id,
						isLast: false,
						title: event.event.PlanEvent.PlanStepCompleteAdded.title,
					});
				}
			} else if (event.event.ExchangeEvent) {
				const sessionId = event.request_id;
				const exchangeId = event.exchange_id;
				const responseStream = this.responseStreamCollection.getResponseStream({
					sessionId,
					exchangeId,
				});
				if (responseStream === undefined) {
					console.log('resonseStreamNotFound::ExchangeEvent::ExchangeEvent', exchangeId, sessionId);
				}
				if (event.event.ExchangeEvent.PlansExchangeState) {
					const editsState = event.event.ExchangeEvent.PlansExchangeState.EditsState;
					if (editsState === 'Loading') {
						responseStream?.stream.planInfo({
							exchangeId,
							sessionId,
							isStale: false,
							state: 'started',
						});
					} else if (editsState === 'Cancelled') {
						responseStream?.stream.planInfo({
							exchangeId,
							sessionId,
							isStale: false,
							state: 'cancelled',
						});
					} else if (editsState === 'InReview') {
						responseStream?.stream.planInfo({
							exchangeId,
							sessionId,
							isStale: false,
							// this state is wrong over here, we should show
							// that the plan is in review right now
							state: 'started',
						});
					} else if (editsState === 'MarkedComplete') {
						responseStream?.stream.planInfo({
							exchangeId,
							sessionId,
							isStale: false,
							state: 'Complete',
						});
					}
					continue;
				}
				if (event.event.ExchangeEvent.EditsExchangeState) {
					const editsState = event.event.ExchangeEvent.EditsExchangeState.EditsState;
					if (editsState === 'Loading') {
						responseStream?.stream.editsInfo({
							exchangeId,
							sessionId,
							files: [],
							isStale: false,
							state: 'loading',
						});
					} else if (editsState === 'Cancelled') {
						responseStream?.stream.editsInfo({
							exchangeId,
							sessionId,
							files: [],
							isStale: false,
							state: 'cancelled',
						});
					} else if (editsState === 'InReview') {
						responseStream?.stream.editsInfo({
							exchangeId,
							sessionId,
							files: [],
							isStale: false,
							state: 'inReview',
						});
					} else if (editsState === 'MarkedComplete') {
						responseStream?.stream.editsInfo({
							exchangeId,
							sessionId,
							files: [],
							isStale: false,
							state: 'markedComplete',
						});
					}
					continue;
				}
				if (event.event.ExchangeEvent.FinishedExchange) {
					if (responseStream) {
						// close the stream if we have finished the exchange
						responseStream.stream.close();
					}
				}
				// remove the response stream from the collection
				this.responseStreamCollection.removeResponseStream({
					sessionId,
					exchangeId,
				});
			}
		}
	}

	dispose() {
		this.aideAgent.dispose();
	}
}


