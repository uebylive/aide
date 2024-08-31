/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, languages, Uri, workspace } from 'vscode';
import { SidecarGetOutlineNodesRequest, SidecarGetOutlineNodesResponse } from './types';

export async function getOutlineNodes(request: SidecarGetOutlineNodesRequest): Promise<SidecarGetOutlineNodesResponse> {
	const documentSymbolProviders = languages.getDocumentSymbolProvider('*');
	const filePath = request.fs_file_path;
	const uri = Uri.file(filePath);

	if (documentSymbolProviders.length === 0) {
		return {
			outline_nodes: [],
		};
	}
	const firstDocumentProvider = documentSymbolProviders[0];
	const textDocument = await workspace.openTextDocument(uri);
	const evenEmitter = new EventEmitter();
	try {
		const documentSymbols = await firstDocumentProvider.provideDocumentSymbols(textDocument, {
			isCancellationRequested: false,
			onCancellationRequested: evenEmitter.event,
		});
		return {
			outline_nodes: documentSymbols,
		};
		// now we want to parse the document symbols and maybe map it back to outline
		// nodes here but thats too much, so we send it back to the rust side for handling
		// not worrying about it for now
	} catch (exception) {
		console.log('getOutlineNodesException');
		console.error(exception);
	}
	return {
		outline_nodes: []
	};
}
