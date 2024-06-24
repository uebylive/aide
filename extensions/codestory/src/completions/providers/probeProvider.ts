/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as uuid from 'uuid';
import * as vscode from 'vscode';
import { SideCarClient } from '../../sidecar/client';
import { reportAgentEventsToChat } from '../../chatState/convertStreamToMessage';

// For the moment, we read a harcoded list of invite codes embedded in the codebase
import { inviteCodes } from '../../invite-codes';

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
			{ provideProbeResponse: this.provideProbeResponse.bind(this) }
		);

		this.checkActivation();
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('aide')) {
				this.checkActivation();
			}
		});
	}


	private checkActivation() {
		const config = vscode.workspace.getConfiguration('aide');
		const code = config.get<string>('probeInviteCode');
		if (!code || !inviteCodes.includes(code)) {
			this.active = false;
		} else {
			this.active = true;
		}

	}

	private async provideProbeResponse(_request: string, response: vscode.ProbeResponseStream, _token: vscode.CancellationToken) {
		const query = _request.trim();

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
		console.log(this._editorUrl, query, threadId);
		// await reportDummyEventsToChat(response);
		return {};
	}

	dispose() {
		console.log('AideProbeProvider.dispose');
	}
}
