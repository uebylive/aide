/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Sets up the status bar so we can show the loading and non-loading status
// for the inline completion features.

import * as vscode from 'vscode';

const statusBarItemText = (enabled: boolean | undefined) =>
	enabled ? '$(check) CodeStory' : '$(circle-slash) CodeStory';

const statusBarItemTooltip = (enabled: boolean | undefined) =>
	enabled ? 'Tab autocomplete is enabled' : 'Click to enable tab autocomplete';

let lastStatusBar: vscode.StatusBarItem | undefined = undefined;

export function setupStatusBar(
	enabled: boolean | undefined,
	loading?: boolean
) {
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right
	);
	statusBarItem.text = loading
		? '$(loading~spin) CodeStory'
		: statusBarItemText(enabled);
	statusBarItem.tooltip = statusBarItemTooltip(enabled);
	statusBarItem.command = 'aide.inlineCompletion.toggleTabAutocompleteEnabled';

	// Swap out with old status bar
	if (lastStatusBar) {
		lastStatusBar.dispose();
	}
	statusBarItem.show();
	lastStatusBar = statusBarItem;

	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('aide')) {
			const config = vscode.workspace.getConfiguration('aide.inlineCompletion');
			const enabled = config.get<boolean>('enableTabAutocomplete');
			statusBarItem.dispose();
			setupStatusBar(enabled);
		}
	});
}

export function statusBarFromConfig() {
	const config = vscode.workspace.getConfiguration('aide.inlineCompletion');
	const enabled = config.get<boolean>('enableTabAutocomplete');
	setupStatusBar(enabled);
}
