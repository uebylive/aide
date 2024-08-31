/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, languages, Uri, workspace } from 'vscode';
import { SidecarGetOutlineNodesRequest, SidecarGetOutlineNodesResponse } from './types';

function getDocumentSelector(fsFilePath: string): string {
	if (fsFilePath.endsWith('rs')) {
		return 'rust';
	}
	if (fsFilePath.endsWith('ts')) {
		return 'typescript';
	}
	if (fsFilePath.endsWith('js')) {
		return 'javascript';
	}
	if (fsFilePath.endsWith('go')) {
		return 'go';
	}
	if (fsFilePath.endsWith('py')) {
		return 'python';
	}
	return '*';
}

export async function getOutlineNodes(request: SidecarGetOutlineNodesRequest): Promise<SidecarGetOutlineNodesResponse> {
	const filePath = request.fs_file_path;
	const languageFilter = getDocumentSelector(filePath);
	const documentSymbolProviders = languages.getDocumentSymbolProvider(
		{ scheme: 'file', language: languageFilter }
	);
	const uri = Uri.file(filePath);
	const textDocument = await workspace.openTextDocument(uri);
	if (documentSymbolProviders.length === 0) {
		return {
			file_content: textDocument.getText(),
			outline_nodes: [],
			language: textDocument.languageId,
		};
	}
	const firstDocumentProvider = documentSymbolProviders[0];
	const evenEmitter = new EventEmitter();
	try {
		const documentSymbols = await firstDocumentProvider.provideDocumentSymbols(textDocument, {
			isCancellationRequested: false,
			onCancellationRequested: evenEmitter.event,
		});
		return {
			file_content: textDocument.getText(),
			outline_nodes: documentSymbols,
			language: textDocument.languageId,
		};
		// now we want to parse the document symbols and maybe map it back to outline
		// nodes here but thats too much, so we send it back to the rust side for handling
		// not worrying about it for now
	} catch (exception) {
		console.log('getOutlineNodesException');
		console.error(exception);
	}
	return {
		file_content: textDocument.getText(),
		outline_nodes: [],
		language: textDocument.languageId,
	};
}
