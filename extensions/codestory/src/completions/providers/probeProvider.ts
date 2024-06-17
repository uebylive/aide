/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SideCarClient } from '../../sidecar/client';
import { reportDummyEventsToChat } from '../../chatState/convertStreamToMessage';

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
		// console.log('provideProbeResponse');
		// const query = _request.trim();
		// const followupResponse = this._sideCarClient.startAgentProbe(query, [], this._editorUrl);
		// await reportAgentEventsToChat(followupResponse, response);
		console.log(this._editorUrl);
		await reportDummyEventsToChat(response);
		return {};
	}

	dispose() {
		console.log('AideProbeProvider.dispose');
	}
}
