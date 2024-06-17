/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { reportDummyEventsToChat } from '../../chatState/convertStreamToMessage';

export class AideProbeProvider extends vscode.Disposable {
	private _disposables: vscode.Disposable[] = [];

	constructor() {
		super(() => this.dispose());

		this._disposables.push(vscode.aideProbe.registerProbeResponseProvider(
			'aideProbeProvider',
			{ provideProbeResponse: this.provideProbeResponse }
		));
	}

	private provideProbeResponse(_request: string, response: vscode.ProbeResponseStream, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.ProbeResult | void> {
		reportDummyEventsToChat(response);
	}

	override dispose() {
		super.dispose();
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}
}
