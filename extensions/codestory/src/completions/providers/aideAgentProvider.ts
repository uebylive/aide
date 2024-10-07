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
import { EditedCodeStreamingRequest, SidecarApplyEditsRequest, SidecarContextEvent } from '../../server/types';
import { RepoRef, SideCarClient } from '../../sidecar/client';
import { getUserId } from '../../utilities/uniqueId';
import { ProjectContext } from '../../utilities/workspaceContext';
import { AidePlanTimer } from '../../utilities/planTimer';

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
	private sessionId: string | undefined;
	private _timer: AidePlanTimer;

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

	async provideEditStreamed(request: EditedCodeStreamingRequest): Promise<{
		fs_file_path: String;
		success: boolean;
	}> {
		if (!request.apply_directly && !this.openResponseStream) {
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
				streamProcessor: new StreamProcessor(
					this.openResponseStream!,
					documentLines,
					undefined,
					vscode.Uri.file(editStreamEvent.fs_file_path),
					editStreamEvent.range,
					null,
					this.iterationEdits,
					editStreamEvent.apply_directly,
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
		fs_file_path: String;
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
		if (!this.sessionId) {
			return;
		}

		const response = await this.aideAgent.initResponse(this.sessionId);
		if (!response) {
			return;
		}

		const { stream, token } = response;
		await this.generateResponse(this.sessionId, event, stream, token);
		this.processingEvents.delete(event.id);
	}

	private async generateResponse(sessionId: string, event: vscode.AideAgentRequest, responseStream: vscode.AideAgentResponseStream, token: vscode.CancellationToken) {
		if (!this.editorUrl) {
			responseStream.close();
			return;
		}

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
			const planResponse = await this.sidecarClient.createPlanRequest(query, sessionId, event.references, this.editorUrl);
			// const planResponse = await this.sidecarClient.generatePlanRequest(query, sessionId, event.references, this.editorUrl);
			if (planResponse.plan) {
				for (const planItem of planResponse.plan.steps) {
					responseStream.step({ sessionId: planResponse.plan.sessionId, ...planItem });
				}
			}
			// await reportFromStreamToSearchProgress(mockResponse, response, token, this._workingDirectory);
		}
		responseStream.close();
	}

	dispose() {
		this.aideAgent.dispose();
	}
}
