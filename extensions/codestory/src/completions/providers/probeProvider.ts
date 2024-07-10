/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as uuid from 'uuid';
import * as vscode from 'vscode';

import { SideCarClient } from '../../sidecar/client';
import { reportAgentEventsToChat } from '../../chatState/convertStreamToMessage';
import { getInviteCode } from '../../utilities/getInviteCode';
import postHogClient from '../../posthog/client';
import { getUniqueId } from '../../utilities/uniqueId';
//import { SideCarAgentEvent } from '../../server/types';

export class AideProbeProvider implements vscode.Disposable {
	private _sideCarClient: SideCarClient;
	private _editorUrl: string;
	private active: boolean = false;

	constructor(
		sideCarClient: SideCarClient,
		editorUrl: string,
	) {
		this._sideCarClient = sideCarClient;
		this._editorUrl = editorUrl;
		console.log(this._editorUrl);

		vscode.aideProbe.registerProbeResponseProvider(
			'aideProbeProvider',
			{
				provideProbeResponse: this.provideProbeResponse.bind(this),
				onDidUserAction(action) {
					postHogClient?.capture({
						distinctId: getUniqueId(),
						event: action.action.type,
						properties: {
							platform: os.platform(),
							requestId: action.sessionId,
						},
					});
				}
			}
		);

		this.checkActivation();

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('aide')) {
				this.checkActivation();
			}
		});
	}


	private checkActivation() {
		this.active = Boolean(getInviteCode());
	}


	private async provideProbeResponse(request: vscode.ProbeRequest, response: vscode.ProbeResponseStream, _token: vscode.CancellationToken) {
		let { query } = request;
		query = query.trim();

		const startTime = process.hrtime();

		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'probe_requested',
			properties: {
				platform: os.platform(),
				query,
				requestId: request.requestId,
			},
		});

		if (!this.active) {
			response.markdown('Please add your invite under `"aide.probeInviteCode"` in your settings.');
			return {};
		}

		const variables: vscode.ChatPromptReference[] = [];
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const fileName = activeEditor.document.fileName.split('/').pop();
			const firstLine = activeEditor.document.lineAt(0);
			const lastLine = activeEditor.document.lineAt(activeEditor.document.lineCount - 1);
			const codeSelection = {
				uri: activeEditor.document.uri,
				range: {
					startLineNumber: firstLine.lineNumber,
					startColumn: firstLine.range.start.character,
					endLineNumber: lastLine.lineNumber,
					endColumn: lastLine.range.end.character
				}
			};
			variables.push({
				id: 'vscode.file',
				name: `file:${fileName}`,
				value: JSON.stringify(codeSelection)
			});
		}

		const threadId = uuid.v4();

		// let probeResponse: AsyncIterableIterator<SideCarAgentEvent>;
		// if (false) {
		const probeResponse = this._sideCarClient.startAgentCodeEdit(query, variables, this._editorUrl, threadId);
		// } else {
		// 	probeResponse = this._sideCarClient.startAgentProbe(query, variables, this._editorUrl, threadId);
		// }

		/* // Use dummy data: Start
		const extensionRoot = vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionPath;
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!extensionRoot || !workspaceRoot) {
			return {};
		}

		const jsonArr = readJsonFile(`${extensionRoot}/src/completions/providers/dummydata.json`);
		const probeResponse = (async function* (arr) {
			for (const original of arr) {
				const itemString = JSON.stringify(original).replace(/\/Users\/skcd\/scratch\/sidecar/g, workspaceRoot);
				const item = JSON.parse(itemString);
				yield item;
			}
		})(jsonArr);
		// Use dummy data: End */

		await reportAgentEventsToChat(probeResponse, response, threadId, _token, this._sideCarClient);

		const endTime = process.hrtime(startTime);
		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'probe_completed',
			properties: {
				platform: os.platform(),
				query,
				timeElapsed: `${endTime[0]}s ${endTime[1] / 1000000}ms`,
				requestId: request.requestId,
			},
		});

		return {};
	}

	dispose() {
		console.log('AideProbeProvider.dispose');
	}
}
