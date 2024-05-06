/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarOpenFileToolRequest, SidecarOpenFileToolResponse } from './types';

export async function openFileEditor(request: SidecarOpenFileToolRequest): Promise<SidecarOpenFileToolResponse> {
	const filePath = request.fs_file_path;
	const textDocument = await vscode.workspace.openTextDocument(filePath);
	// we get back the text document over here
	const contents = textDocument.getText();
	return {
		fs_file_path: filePath,
		file_contents: contents,
	};
}
