/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const OPEN_FILES_VARIABLE = 'openFiles';

export function registerOpenFiles() {
	vscode.chat.registerChatVariableResolver(
		OPEN_FILES_VARIABLE,
		OPEN_FILES_VARIABLE,
		'Open files in the workspace',
		'Open files in the workspace',
		false,
		{
			resolve: (_name: string, _context: vscode.ChatVariableContext, _token: vscode.CancellationToken) => {
				const openFiles = vscode.workspace.textDocuments;
				return openFiles
					.filter(file => file.uri.scheme === 'file')
					.map(file => {
						const objVal = {
							uri: file.uri,
							range: {
								startLineNumber: 1,
								startColumn: 1,
								endLineNumber: file.lineCount,
								endColumn: 1,
							}
						};
						return {
							level: vscode.ChatVariableLevel.Full,
							value: JSON.stringify(objVal)
						};
					});
			}
		},
		'Open files',
		vscode.ThemeIcon.File
	);
}
