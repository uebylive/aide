/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { reportFromStreamToSearchProgress } from '../../chatState/convertStreamToMessage';
import { RepoRef, SideCarClient } from '../../sidecar/client';
import { getUserId } from '../../utilities/uniqueId';
import { ProjectContext } from '../../utilities/workspaceContext';

export class AideAgentSessionProvider implements vscode.AideSessionParticipant {
	private aideAgent: vscode.AideSessionAgent;

	private sessionId: string | undefined;
	private eventQueue: vscode.AideAgentRequest[];
	private processingEvents: Map<string, boolean> = new Map();

	constructor(
		private currentRepoRef: RepoRef,
		private projectContext: ProjectContext,
		private sidecarClient: SideCarClient,
		private workingDirectory: string,
	) {
		this.eventQueue = [];
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

		const responseStream = await this.aideAgent.initResponse(this.sessionId);
		if (!responseStream) {
			return;
		}

		await this.generateResponse(this.sessionId, event, responseStream);
		this.processingEvents.delete(event.id);
	}

	private async generateResponse(sessionId: string, event: vscode.AideAgentRequest, responseStream: vscode.AideAgentResponseStream) {
		// TODO(@ghostwriternr): This is a temporary value, the token should ideally be passed to the request/response lifecycle.
		const cts = new vscode.CancellationTokenSource();
		const query = event.prompt;
		const followupResponse = this.sidecarClient.followupQuestion(query, this.currentRepoRef, sessionId, event.references, this.projectContext.labels);
		await reportFromStreamToSearchProgress(followupResponse, responseStream, cts.token, this.workingDirectory);
		responseStream.close();
	}

	dispose() {
		this.aideAgent.dispose();
	}
}
