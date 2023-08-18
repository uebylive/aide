/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface SelectionData {
	documentFilePath: string;
	selection: vscode.Selection;
	selectedText: string;
	labelInformation: {
		label: string;
		hyperlink: string;
	};
}


const getLabelForSelectedContext = (workingDirectory: string, filePath: string, selection: vscode.Selection): {
	label: string;
	hyperlink: string;
} => {
	const relativePath = vscode.workspace.asRelativePath(filePath);
	const lineStart = selection.start.line + 1;
	const lineEnd = selection.end.line + 1;
	const columnStart = selection.start.character + 1;
	const columnEnd = selection.end.character + 1;
	return {
		label: `${relativePath} ${lineStart}:${columnStart} - ${lineEnd}:${columnEnd}`,
		hyperlink: `vscode://${filePath}:${lineStart}:${columnStart}?end=${lineEnd}:${columnEnd}`,
	};
};

export const getSelectedCodeContext = (workingDirectory: string): SelectionData | null => {
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		const document = editor.document;
		const selection = editor.selection;

		if (selection.start.line === selection.end.line && selection.start.character === selection.end.character) {
			return null;
		}

		// Get the selected text
		const selectedText = document.getText(selection);
		return {
			documentFilePath: document.fileName,
			selection: selection,
			selectedText: selectedText,
			labelInformation: getLabelForSelectedContext(workingDirectory, document.fileName, selection),
		};
	}
	return null;
};
