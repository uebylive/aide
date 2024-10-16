/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as net from 'net';
import * as vscode from 'vscode';

import { AnswerSplitOnNewLineAccumulatorStreaming, reportAgentEventsToChat, reportFromStreamToSearchProgress, StreamProcessor } from '../../chatState/convertStreamToMessage';
import { applyEdits, applyEditsDirectly, Limiter } from '../../server/applyEdits';
import { RecentEditsRetriever } from '../../server/editedFiles';
import { handleRequest } from '../../server/requestHandler';
import { EditedCodeStreamingRequest, SideCarAgentEvent, SidecarApplyEditsRequest, SidecarContextEvent } from '../../server/types';
import { RepoRef, SideCarClient } from '../../sidecar/client';
import { getUserId } from '../../utilities/uniqueId';
import { ProjectContext } from '../../utilities/workspaceContext';
import { AidePlanTimer } from '../../utilities/planTimer';
import { ConversationMessage, PlanResponse } from '../../sidecar/types';

/**
 * Stores the necessary identifiers required for identifying a response stream
 */
interface ResponseStreamIdentifier {
	sessionId: string;
	exchangeId: string;
}

class AideResponseStreamCollection {
	private responseStreamCollection: Map<string, vscode.AideAgentEventSenderResponse> = new Map();

	constructor() {

	}

	getKey(responseStreamIdentifier: ResponseStreamIdentifier): string {
		return `${responseStreamIdentifier.sessionId}-${responseStreamIdentifier.exchangeId}`;
	}

	addResponseStream(responseStreamIdentifier: ResponseStreamIdentifier, responseStream: vscode.AideAgentEventSenderResponse) {
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
	private limiter = new Limiter(1);
	private openResponseStream: vscode.AideAgentResponseStream | undefined;
	private processingEvents: Map<string, boolean> = new Map();
	// our collection of active response streams for exchanges which are still running
	private responseStreamCollection: AideResponseStreamCollection = new AideResponseStreamCollection();
	private sessionId: string | undefined;
	private _timer: AidePlanTimer;
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
		private workingDirectory: string,
		timer: AidePlanTimer,
		recentEditsRetriever: RecentEditsRetriever,
	) {
		this.requestHandler = http.createServer(
			handleRequest(
				this.provideEdit.bind(this),
				this.provideEditStreamed.bind(this),
				this.newExchangeIdForSession.bind(this),
				recentEditsRetriever.retrieveSidecar.bind(recentEditsRetriever)
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

		this._timer = timer;
		this.aideAgent = vscode.aideAgent.createChatParticipant('aide', {
			newSession: this.newSession.bind(this),
			handleEvent: this.handleEvent.bind(this)
		});
		this.aideAgent.iconPath = vscode.Uri.joinPath(vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionUri ?? vscode.Uri.parse(''), 'assets', 'aide-agent.png');
		this.aideAgent.requester = {
			name: getUserId(),
			icon: vscode.Uri.joinPath(vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionUri ?? vscode.Uri.parse(''), 'assets', 'aide-user.png')
		};
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

	async newExchangeIdForSession(sessionId: string): Promise<{
		exchange_id: string | undefined;
	}> {
		// TODO(skcd): Figure out when the close the exchange? This is not really
		// well understood but we should have an explicit way to do that
		const response = await this.aideAgent.initResponse(sessionId);
		if (response !== undefined) {
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
		if (!request.apply_directly && !this.openResponseStream && !responseStream) {
			console.log('editing_streamed::no_open_response_stream');
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
					'plan_0',
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

	handleEvent(event: vscode.AideAgentRequest): void {
		this.eventQueue.push(event);
		if (this.sessionId && !this.processingEvents.has(event.id)) {
			this.processingEvents.set(event.id, true);
			this.processEvent(event);
		}
	}

	private async processEvent(event: vscode.AideAgentRequest): Promise<void> {
		// We are slowly going to migrate to the new flow, to start with lets check if
		// the chat flow can be migrated to the new flow
		if (!this.sessionId || !this.editorUrl) {
			return;
		}
		// New flow migration
		if (event.mode === vscode.AideAgentMode.Chat || event.mode === vscode.AideAgentMode.Edit) {
			await this.streamResponse(event, this.sessionId, this.editorUrl);
			return;
		}


		const response = await this.aideAgent.initResponse(this.sessionId);
		if (!response) {
			return;
		}

		const { stream, token, exchangeId } = response;
		console.log('exchangeId::oldFlow', exchangeId);
		await this.generateResponse(this.sessionId, event, stream, token);
		this.processingEvents.delete(event.id);
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
			const responseStream = await this.sidecarClient.agentSessionChat(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels);
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
				const responseStream = await this.sidecarClient.agentSessionAgenticEdit(prompt, sessionId, exchangeIdForEvent, editorUrl, agentMode, variables, this.currentRepoRef, this.projectContext.labels);
				await this.reportAgentEventsToChat(true, responseStream);
			}
		}
	}

	private async generateResponse(sessionId: string, event: vscode.AideAgentRequest, responseStream: vscode.AideAgentResponseStream, token: vscode.CancellationToken) {
		if (!this.editorUrl) {
			responseStream.close();
			return;
		}

		// always store the responseStream in the openResponseStream variable so we can
		// assume that the connection is open for way longer after a session has been started
		this.openResponseStream = responseStream;
		const query = event.prompt;
		if (event.mode === vscode.AideAgentMode.Chat) {
			const followupResponse = this.sidecarClient.followupQuestion(query, this.currentRepoRef, sessionId, event.references as vscode.AideAgentFileReference[], this.projectContext.labels, this.editorUrl, this._timer);
			await reportFromStreamToSearchProgress(followupResponse, responseStream, token, this.workingDirectory);
		} else if (event.mode === vscode.AideAgentMode.Edit) {
			const isAnchorEditing = event.scope === vscode.AideAgentScope.Selection;
			const isWholeCodebase = event.scope === vscode.AideAgentScope.Codebase;
			const probeResponse = this.sidecarClient.startAgentCodeEdit(query, event.references, this.editorUrl, sessionId, isWholeCodebase, isAnchorEditing);
			await reportAgentEventsToChat(true, probeResponse, responseStream, sessionId, token, this.sidecarClient, this.iterationEdits, this.limiter);
		} else if (event.mode === vscode.AideAgentMode.Plan) {
			let planActionRequest: PlanActionRequest;
			try {
				planActionRequest = parsePlanActionCommand(event.prompt);
			} catch (error) {
				console.error(error);
				planActionRequest = {
					type: 'CREATE',
				};
			}

			console.log({ planActionRequest });

			// TODO(skcd): Keep track of @references as the variable and make sure
			// that this works properly on the sidecar so we can show the model going
			// to different files and following instructions for long

			// we may not receive one back
			let planResponse: PlanResponse | undefined = undefined;

			if (planActionRequest.type === 'DROP') {
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.insert(vscode.Uri.file('undoCheck'), new vscode.Position(0, 0), `plan_${planActionRequest.index}`);
				responseStream.codeEdit(workspaceEdit);
			}

			let executionStream: AsyncIterableIterator<ConversationMessage> | undefined = undefined;

			switch (planActionRequest.type) {
				case 'CREATE':
					console.log('create hit');
					//planResponse = generateMockPlan();
					planResponse = await this.sidecarClient.createPlanRequest(query, sessionId, event.references, this.editorUrl, false);
					break;
				case 'APPEND': // this should be explicit, from button action (or command line)
					console.log('AppendHit');
					planResponse = await this.sidecarClient.appendPlanRequest(query, sessionId, this.editorUrl, event.references);
					break;
				case 'DROP':
					console.log('DropHit');
					planResponse = await this.sidecarClient.dropPlanFromRequest(planActionRequest.index, sessionId);
					break;
				case 'EXECUTE':
					console.log('ExecuteHit');
					// this streams, plan is not updated
					executionStream = await this.sidecarClient.executePlanUntilRequest(planActionRequest.index, sessionId, this.editorUrl);
					break;
				case 'REFERENCES':
					console.log('ReferencesHit');
					executionStream = await this.sidecarClient.checkReferencesAtErrors(query, sessionId, this.editorUrl, event.references);
					break;
			}

			if ((planActionRequest.type === 'EXECUTE' || planActionRequest.type === 'REFERENCES') && executionStream !== undefined) {
				// take all lsp signals, pass it to o1 or something and have it stream back a question or information to the user
				// as feedback for work and help
				await reportFromStreamToSearchProgress(executionStream, this.openResponseStream, token, this.workingDirectory);
				// go to files outside the scope and try to see what we can fix (either suggest new plan steps or ask for help)
			}

			// this logic is not relevant for execute, this is shite code.
			// we do not pass on the index from the sidecar side, so we can populate that
			// over here
			if (planResponse?.plan) {
				console.log('planResponse::plan');
				console.log(planResponse.plan);
				for (const planItem of planResponse.plan.steps.entries()) {
					const stepIndex = planItem[0];
					console.log('plan::index', stepIndex);
					console.log(planItem[1].description);
					const planItemStep = planItem[1];
					// populate the index over here
					planItemStep.index = stepIndex;
					const { sessionId } = planResponse.plan;
					const isLast = planItemStep.index === planResponse.plan.steps.length - 1;
					responseStream.step({ sessionId, isLast, ...planItemStep });
				}
			}
		}
		// responseStream.close();
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
					console.log(event.event.FrameworkEvent.AgenticTopLevelThinking);
				} else if (event.event.FrameworkEvent.AgenticSymbolLevelThinking) {
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
						// we have to do some state management over here
						// we send 3 distinct type of events over here
						// - start
						// - delta
						// - end
						// const editStreamEvent = editEvent.EditCodeStreaming;
						// if ('Start' === editStreamEvent.event) {
						// 	const fileDocument = editStreamEvent.fs_file_path;
						// 	const document = await vscode.workspace.openTextDocument(fileDocument);
						// 	if (document === undefined || document === null) {
						// 		continue;
						// 	}
						// 	const documentLines = document.getText().split(/\r\n|\r|\n/g);
						// 	console.log('editStreaming.start', editStreamEvent.fs_file_path);
						// 	console.log(editStreamEvent.range);
						// 	editsMap.set(editStreamEvent.edit_request_id, {
						// 		answerSplitter: new AnswerSplitOnNewLineAccumulatorStreaming(),
						// 		// TODO(skcd): This should be the real response stream here depending on
						// 		// which exchange this is part of
						// 		streamProcessor: new StreamProcessor(
						// 			responseStream,
						// 			documentLines,
						// 			undefined,
						// 			vscode.Uri.file(editStreamEvent.fs_file_path),
						// 			editStreamEvent.range,
						// 			limiter,
						// 			iterationEdits,
						// 			false,
						// 			// hack for now, we will figure out the right way to
						// 			// handle this
						// 			'plan_0',
						// 		)
						// 	});
						// } else if ('End' === editStreamEvent.event) {
						// 	// drain the lines which might be still present
						// 	const editsManager = editsMap.get(editStreamEvent.edit_request_id);
						// 	while (true) {
						// 		const currentLine = editsManager.answerSplitter.getLine();
						// 		if (currentLine === null) {
						// 			break;
						// 		}
						// 		console.log('end::process_line');
						// 		await editsManager.streamProcessor.processLine(currentLine);
						// 	}
						// 	console.log('end::cleanup');
						// 	editsManager.streamProcessor.cleanup();
						// 	// delete this from our map
						// 	editsMap.delete(editStreamEvent.edit_request_id);
						// 	// we have the updated code (we know this will be always present, the types are a bit meh)
						// } else if (editStreamEvent.event.Delta) {
						// 	const editsManager = editsMap.get(editStreamEvent.edit_request_id);
						// 	if (editsManager !== undefined) {
						// 		editsManager.answerSplitter.addDelta(editStreamEvent.event.Delta);
						// 		while (true) {
						// 			const currentLine = editsManager.answerSplitter.getLine();
						// 			if (currentLine === null) {
						// 				break;
						// 			}
						// 			console.log('delta::process_line');
						// 			await editsManager.streamProcessor.processLine(currentLine);
						// 		}
						// 	}
						// }
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
				break;
			} else if (event.event.ChatEvent) {
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
			} else if (event.event.ExchangeEvent) {
				const sessionId = event.request_id;
				const exchangeId = event.exchange_id;
				const responseStream = this.responseStreamCollection.getResponseStream({
					sessionId,
					exchangeId,
				});
				if (responseStream === undefined) {
					console.log('resonseStreamNotFound::ExchangeEvent', exchangeId, sessionId);
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

type PlanActionRequest =
	| { type: 'CREATE' | 'APPEND' | 'REFERENCES' }
	| { type: 'DROP' | 'EXECUTE'; index: number };

function parsePlanActionCommand(command: string): PlanActionRequest {
	const match = command.match(/^@(\w+)(?:\s+(\d+))?$/);
	if (!match) {
		if (command.startsWith('@REFERENCES')) {
			return { type: 'REFERENCES' };
		}
		return { type: 'CREATE' };  // Default action is explicit now
	}

	const [, action, indexStr] = match;
	const actionType = action.toUpperCase() as 'CREATE' | 'APPEND' | 'DROP' | 'EXECUTE' | 'REFERENCES';

	if (actionType === 'DROP' || actionType === 'EXECUTE') {
		if (indexStr === undefined) {
			throw new Error(`Index is required for ${actionType} action`);
		}
		return { type: actionType, index: parseInt(indexStr, 10) };
	}

	return { type: actionType };
}

//function generateMockPlan(): PlanResponse {
//	const mockPlan = { plan: { "id": "e032f413-1abd-4c1b-b094-96f9688ec902", "name": "Placeholder Title (to be computed)", "steps": [{ "id": "0", "index": 0, "title": "\nAdd counter element to the status bar in HTML\n", "files_to_edit": ["index.html"], "description": "\nWe'll add a new element to the status bar in the HTML file to display the counter. Assuming there's already a status bar element, we'll add a span for the counter inside it.\n\n```html\n<div id=\"status-bar\">\n  <!-- Existing status bar content -->\n  <span id=\"counter\">0</span>\n</div>\n```\n\nThis change adds a span element with the id \"counter\" inside the status bar div. The initial value is set to 0.\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }, { "id": "1", "index": 1, "title": "\nStyle the counter in CSS\n", "files_to_edit": ["styles.css"], "description": "\nWe'll add some basic styling for the counter to make it visually distinct within the status bar.\n\n```css\n#counter {\n  font-weight: bold;\n  margin-left: 10px;\n  padding: 2px 5px;\n  background-color: #f0f0f0;\n  border-radius: 3px;\n}\n```\n\nThis CSS gives the counter a bold font, adds some margin and padding, sets a light background color, and applies rounded corners.\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }, { "id": "2", "index": 2, "title": "\nImplement counter functionality in JavaScript\n", "files_to_edit": ["script.js"], "description": "\nWe'll add JavaScript code to initialize the counter, increment it, and update the display in the status bar.\n\n```javascript\nlet count = 0;\nconst counterElement = document.getElementById('counter');\n\nfunction incrementCounter() {\n  count++;\n  updateCounterDisplay();\n}\n\nfunction updateCounterDisplay() {\n  counterElement.textContent = count;\n}\n\n// Example: Increment counter every second\nsetInterval(incrementCounter, 1000);\n```\n\nThis JavaScript code does the following:\n1. Initializes a count variable and gets a reference to the counter element.\n2. Defines an incrementCounter function to increase the count.\n3. Defines an updateCounterDisplay function to update the counter in the HTML.\n4. Sets up an interval to increment the counter every second (this is just an example; you may want to trigger the increment based on specific events in your application).\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }], "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null }, "user_query": "Add a counter to the status bar", "checkpoint": null, "storage_path": "/Users/guglielmodanna/Library/Application Support/ai.codestory.sidecar/plans/e032f413-1abd-4c1b-b094-96f9688ec902" } } as unknown as PlanResponse;
//	return mockPlan
//}


