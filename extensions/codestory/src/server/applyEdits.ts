/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SidecarApplyEditsRequest, SidecarApplyEditsResponse } from './types';
import * as vscode from 'vscode';

/**
 * We want to apply edits to the codebase over here and try to get this ti work
 */

export async function applyEdits(request: SidecarApplyEditsRequest): Promise<SidecarApplyEditsResponse> {
	const filePath = request.fs_file_path;
	const startPosition = request.selected_range.startPosition;
	const endPosition = request.selected_range.endPosition;
	const replacedText = request.edited_content;
	const range = new vscode.Range(new vscode.Position(startPosition.line, startPosition.character), new vscode.Position(endPosition.line, endPosition.character));
	const workspaceEdit = new vscode.WorkspaceEdit();
	const fileUri = vscode.Uri.file(filePath);

	// we want to open the text document first
	await vscode.workspace.openTextDocument(fileUri);
	workspaceEdit.replace(
		fileUri,
		range,
		replacedText,
	);
	// apply the edits to it
	const success = await vscode.workspace.applyEdit(workspaceEdit);
	// we also want to save the file at this point after applying the edit
	const _ = await vscode.workspace.save(fileUri);


	// we calculate how many lines we get after replacing the text
	// once we make the edit on the range, the new range is presented to us
	// we have to calculate the new range and use that instead
	// simple algo here would be the following:
	const lines = replacedText.split(/\r\n|\r|\n/);
	let lastLineColumn = 0;
	if (lines.length > 0) {
		lastLineColumn = lines[lines.length - 1].length
	} else {
		lastLineColumn = replacedText.length + startPosition.character;
	}
	const newRange = {
		startPosition: {
			line: startPosition.line,
			character: startPosition.character,
			byte_offset: 0,
		},
		endPosition: {
			line: startPosition.line + replacedText.split(/\r\n|\r|\n/).length,
			character: lastLineColumn,
			byte_offset: 0,
		}
	};
	return {
		fs_file_path: filePath,
		success,
		new_range: newRange,
	};
}
