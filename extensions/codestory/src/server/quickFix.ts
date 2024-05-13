/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarQuickFixRequest, SidecarQuickFixResponse } from './types';

// TODO(skcd): This is not complete yet, we have to invoke the request
// multiple times and then invoke the request and save the changes
export async function quickFixList(request: SidecarQuickFixRequest): Promise<SidecarQuickFixResponse> {
	const textDocumentUri = vscode.Uri.file(request.fs_file_path);
	await vscode.workspace.openTextDocument(textDocumentUri);
	const codeActions: vscode.CodeAction[] = await vscode.commands.executeCommand(
		'vscode.executeCodeActionProvider',
		textDocumentUri,
		request.range,
	);
	// Over here try to get all the code actions which we need to execute
	const titles = codeActions.map((codeAction) => {
		return codeAction.title;
	});
	return {
		options: titles,
	};
}
