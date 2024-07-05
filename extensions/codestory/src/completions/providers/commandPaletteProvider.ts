/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';

import { getInviteCode } from '../../utilities/getInviteCode';
import postHogClient from '../../posthog/client';
import { getUniqueId } from '../../utilities/uniqueId';

export class CommandPaletteProvider implements vscode.Disposable {
	//private _sideCarClient: SideCarClient;
	private _editorUrl: string;
	private active: boolean = false;

	constructor(
		//sideCarClient: SideCarClient,
		editorUrl: string,
	) {
		// this._sideCarClient = sideCarClient;
		this._editorUrl = editorUrl;
		console.log(this._editorUrl);

		vscode.aideCommandPalette.registerCommandPaletteProvider(
			'aideCommandPaletteProvider',
			{
				provideResponse: this.provideResponse.bind(this),
			}
		);

		this.checkActivation();

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('aide')) {
				this.checkActivation();
			}
		});
	}

	private async provideResponse(request: vscode.CommandPaletteRequest) {
		let { query } = request;
		query = query.trim();

		postHogClient?.capture({
			distinctId: getUniqueId(),
			event: 'command_palette_request',
			properties: {
				platform: os.platform(),
				query,
			},
		});

		console.log(query);

		if (!this.active) {
			// TODO show a message to the user that they need to activate the extension
			return;
		}
	}


	private checkActivation() {
		this.active = Boolean(getInviteCode());
	}


	dispose() {
		console.log('CommandPaletteProvider.dispose');
	}
}
