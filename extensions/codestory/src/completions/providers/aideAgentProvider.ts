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
import { PlanResponse } from '../../sidecar/types';

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
			console.log({ event });
			let planActionRequest: PlanActionRequest;
			try {
				planActionRequest = parsePlanActionCommand(event.prompt);
			} catch (error) {
				console.error(error);
				console.log("this implicitly means that we are doing CREATE")
				planActionRequest = {
					type: "CREATE"
				}
			}

			console.log({ planActionRequest });

			// we may not receive one back
			let planResponse: PlanResponse | undefined = undefined;

			switch (planActionRequest.type) {
				case 'CREATE':
					console.log("create hit")
					planResponse = generateMockPlan();
					//planResponse = await this.sidecarClient.createPlanRequest(query, sessionId, event.references, this.editorUrl);
					break;
				case 'APPEND': // this should be explicit, from button action (or command line)
					console.log("append hit")
					planResponse = await this.sidecarClient.appendPlanRequest(query, sessionId, this.editorUrl, event.references);
					break;
				case 'DROP':
					console.log("drop hit")
					planResponse = await this.sidecarClient.dropPlanFromRequest(planActionRequest.index, sessionId);
					break;
				case 'EXECUTE':
					console.log("execute hit")
					// this streams, plan is not updated
					await this.sidecarClient.executePlanUntilRequest(planActionRequest.index, sessionId, this.editorUrl);
					break;
			}

			// this logic s not relevant for execute, this is shite code.
			if (planResponse?.plan) {
				for (const planItem of planResponse.plan.steps) {
					const { sessionId } = planResponse.plan;
					const isLast = planItem.index === planResponse.plan.steps.length - 1;
					responseStream.step({ sessionId, isLast, ...planItem });
				}
			}
		}
		responseStream.close();
	}

	dispose() {
		this.aideAgent.dispose();
	}
}

type PlanActionRequest =
	| { type: 'CREATE' | 'APPEND' }
	| { type: 'DROP' | 'EXECUTE', index: number };

function parsePlanActionCommand(command: string): PlanActionRequest {
	const match = command.match(/^@(\w+)(?:\s+(\d+))?$/);
	if (!match) {
		return { type: 'CREATE' };  // Default action is explicit now
	}

	const [, action, indexStr] = match;
	const actionType = action.toUpperCase() as 'CREATE' | 'APPEND' | 'DROP' | 'EXECUTE';

	if (actionType === 'DROP' || actionType === 'EXECUTE') {
		if (indexStr === undefined) {
			throw new Error(`Index is required for ${actionType} action`);
		}
		return { type: actionType, index: parseInt(indexStr, 10) };
	}

	return { type: actionType };
}
function generateMockPlan(): PlanResponse {
	const mockPlan = { plan: { "id": "e032f413-1abd-4c1b-b094-96f9688ec902", "name": "Placeholder Title (to be computed)", "steps": [{ "id": "0", "index": 0, "title": "\nAdd counter element to the status bar in HTML\n", "files_to_edit": ["index.html"], "description": "\nWe'll add a new element to the status bar in the HTML file to display the counter. Assuming there's already a status bar element, we'll add a span for the counter inside it.\n\n```html\n<div id=\"status-bar\">\n  <!-- Existing status bar content -->\n  <span id=\"counter\">0</span>\n</div>\n```\n\nThis change adds a span element with the id \"counter\" inside the status bar div. The initial value is set to 0.\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }, { "id": "1", "index": 1, "title": "\nStyle the counter in CSS\n", "files_to_edit": ["styles.css"], "description": "\nWe'll add some basic styling for the counter to make it visually distinct within the status bar.\n\n```css\n#counter {\n  font-weight: bold;\n  margin-left: 10px;\n  padding: 2px 5px;\n  background-color: #f0f0f0;\n  border-radius: 3px;\n}\n```\n\nThis CSS gives the counter a bold font, adds some margin and padding, sets a light background color, and applies rounded corners.\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }, { "id": "2", "index": 2, "title": "\nImplement counter functionality in JavaScript\n", "files_to_edit": ["script.js"], "description": "\nWe'll add JavaScript code to initialize the counter, increment it, and update the display in the status bar.\n\n```javascript\nlet count = 0;\nconst counterElement = document.getElementById('counter');\n\nfunction incrementCounter() {\n  count++;\n  updateCounterDisplay();\n}\n\nfunction updateCounterDisplay() {\n  counterElement.textContent = count;\n}\n\n// Example: Increment counter every second\nsetInterval(incrementCounter, 1000);\n```\n\nThis JavaScript code does the following:\n1. Initializes a count variable and gets a reference to the counter element.\n2. Defines an incrementCounter function to increase the count.\n3. Defines an updateCounterDisplay function to update the counter in the HTML.\n4. Sets up an interval to increment the counter every second (this is just an example; you may want to trigger the increment based on specific events in your application).\n", "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null } }], "user_context": { "variables": [], "file_content_map": [], "terminal_selection": null, "folder_paths": [], "is_plan_generation": false, "is_plan_execution_until": null, "is_plan_append": false, "is_plan_drop_from": null }, "user_query": "Add a counter to the status bar", "checkpoint": null, "storage_path": "/Users/guglielmodanna/Library/Application Support/ai.codestory.sidecar/plans/e032f413-1abd-4c1b-b094-96f9688ec902" } } as unknown as PlanResponse;
	return mockPlan
}


