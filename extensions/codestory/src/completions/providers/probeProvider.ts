/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as uuid from 'uuid';
import * as vscode from 'vscode';
import { SideCarClient } from '../../sidecar/client';
import { reportAgentEventsToChat } from '../../chatState/convertStreamToMessage';
import { getInviteCode } from '../../utilities/getInviteCode';


import postHogClient from '../../posthog/client';
import { getUniqueId } from '../../utilities/uniqueId';
import * as os from 'os';

export class AideProbeProvider implements vscode.Disposable {
	private _sideCarClient: SideCarClient;
	private _editorUrl: string;
	private active: boolean = false;

	constructor(
		sideCarClient: SideCarClient,
		editorUrl: string,
	) {
		console.log('AideProbeProvider');
		console.log(sideCarClient);
		this._sideCarClient = sideCarClient;
		this._editorUrl = editorUrl;
		console.log(this._sideCarClient);

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
		// console.log('threadId', threadId);
		const probeResponse = await this._sideCarClient.startAgentProbe(query, variables, this._editorUrl, threadId);
		console.log('probeResponse', probeResponse);
		// To use dummy data, get the gist from here: https://gist.github.com/theskcd/8292bf96db11190d52d2d758a340ed20 and read it
		// to a file
		// const stream = readJsonFile('/Users/skcd/scratch/ide/extensions/codestory/src/dummydata.json');
		await reportAgentEventsToChat(probeResponse, response, threadId, _token, this._sideCarClient);
		// console.log('reportAgentEventsToChat done');


		const endTime = process.hrtime(startTime);
		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'probe_completed',
			properties: {
				platform: os.platform(),
				timeElapsed: `${endTime[0]}s ${endTime[1] / 1000000}ms`,
				requestId: request.requestId,
			},
		});


		console.log(this._editorUrl, query, threadId);
		// await reportDummyEventsToChat(response);
		return {};
	}

	dispose() {
		console.log('AideProbeProvider.dispose');
	}
}
