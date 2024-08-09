/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CodeStoryAuthProvider } from './codestory';

export function activate(context: vscode.ExtensionContext) {
	const codestoryAuthenticationProvider = new CodeStoryAuthProvider(context);
	codestoryAuthenticationProvider.initialize();
	context.subscriptions.push(codestoryAuthenticationProvider);

	const disposable = vscode.commands.registerCommand('codestory-authentication.login', async () => {
		codestoryAuthenticationProvider.createSession([]);
	});
	context.subscriptions.push(disposable);
}
