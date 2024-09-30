/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const GENERATE_PLAN = 'generatePlan';

export function registerGeneratePlan(extensionContext: vscode.ExtensionContext) {
	console.log('registerGeneratePlan');
	extensionContext.subscriptions.push(vscode.aideChat.registerChatVariableResolver(
		GENERATE_PLAN,
		GENERATE_PLAN,
		'Generates a plan for execution',
		'Generates a plan for execution',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				return [{
					level: vscode.ChatVariableLevel.Full,
					value: 'generatePlan',
				}];
			}
		},
		'Open files',
		vscode.ThemeIcon.Folder
	));
}
