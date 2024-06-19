/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as uuid from 'uuid';
import * as vscode from 'vscode';
import { SideCarClient } from '../../sidecar/client';
import { readJsonFile, reportAgentEventsToChat } from '../../chatState/convertStreamToMessage';

export class AideProbeProvider implements vscode.Disposable {
	private _sideCarClient: SideCarClient;
	private _editorUrl: string;

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
	}

	private async provideProbeResponse(_request: string, response: vscode.ProbeResponseStream, _token: vscode.CancellationToken) {
		const query = _request.trim();
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
		// const probeResponse = await this._sideCarClient.startAgentProbe(query, variables, this._editorUrl, threadId);
		// console.log('probeResponse', probeResponse);
		const stream = readJsonFile('/Users/nareshr/github/codestory/ide/extensions/codestory/src/dummydata.json');
		await reportAgentEventsToChat(stream, response, threadId, _token, this._sideCarClient);
		// console.log('reportAgentEventsToChat done');
		console.log(this._editorUrl, query, threadId);
		// await reportDummyEventsToChat(response);
		return {};
	}

	dispose() {
		console.log('AideProbeProvider.dispose');
	}
}
