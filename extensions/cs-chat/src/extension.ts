/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CSChatProvider } from './chatprovider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const interactiveSession = vscode.interactive.registerInteractiveSessionProvider('cs-chat', new CSChatProvider());
	context.subscriptions.push(interactiveSession);
}

// This method is called when your extension is deactivated
export function deactivate() { }
