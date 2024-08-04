/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SidecarInlayHintsRequeest } from './types';
import * as vscode from 'vscode';

export async function inlayHints(
	request: SidecarInlayHintsRequeest,
): Promise<boolean> {
	const filePath = request.fs_file_path;
	const requestRange = request.range;
	const range = new vscode.Range(new vscode.Position(requestRange.startPosition.line, 0), new vscode.Position(requestRange.endPosition.line, requestRange.endPosition.character));
	const inlayHintsProvider = await vscode.languages.getInlayHintsProvider('*');
	const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
	const evenEmitter = new vscode.EventEmitter();
	try {
		const hints = await inlayHintsProvider?.provideInlayHints(textDocument, range, {
			isCancellationRequested: false,
			onCancellationRequested: evenEmitter.event,
		});
		console.log('inlayHints::generated_hints');
		console.log('inlayHints::hints::len', hints?.length);
		console.log(hints);
	} catch (exception) {
		console.log('exception');
		console.log(exception);
	}
	return true;
}
