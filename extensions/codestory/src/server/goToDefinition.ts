/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarGoToDefinitionRequest, SidecarGoToDefinitionResponse } from './types';
import { shouldTrackFile } from '../utilities/openTabs';

export async function goToDefinition(request: SidecarGoToDefinitionRequest): Promise<SidecarGoToDefinitionResponse> {
	const locations: vscode.LocationLink[] = await vscode.commands.executeCommand(
		'vscode.executeTypeDefinitionProvider',
		request.fs_file_path,
		request.position
	);
	const definitons = await Promise.all(locations.map(async (location) => {
		const uri = location.targetUri;
		const range = location.targetRange;
		// we have to always open the text document first, this ends up sending
		// it over to the sidecar as a side-effect but that is fine

		// No need to await on this
		if (shouldTrackFile(uri)) {
			console.log('we are tracking this uri');
			console.log(uri);
			// 	sidecarClient.documentOpen(textDocument.uri.fsPath, textDocument.getText(), textDocument.languageId);
		}

		// return the value as we would normally
		return {
			fs_file_path: uri.fsPath,
			range: {
				startPosition: {
					line: range.start.line,
					character: range.start.character,
				},
				endPosition: {
					line: range.end.line,
					character: range.end.character,
				}
			},
		};
	}));
	// lets return all of them over here
	return {
		symbols: definitons,
	};
}
