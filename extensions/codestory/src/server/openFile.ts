/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarOpenFileToolRequest, SidecarOpenFileToolResponse } from './types';

export async function openFileEditor(request: SidecarOpenFileToolRequest): Promise<SidecarOpenFileToolResponse> {
	const filePath = request.fs_file_path;
	try {
		const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
		console.log(stat);
		const textDocument = await vscode.workspace.openTextDocument(filePath);
		// we get back the text document over here
		const contents = textDocument.getText();
		const language = textDocument.languageId;
		return {
			fs_file_path: filePath,
			file_contents: contents,
			language,
			exists: true,
		};
	} catch {
		return {
			fs_file_path: filePath,
			file_contents: '',
			language: '',
			exists: false,
		};
	}
}
