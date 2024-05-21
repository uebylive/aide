/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarGoToReferencesRequest, SidecarGoToRefernecesResponse } from './types';
import { shouldTrackFile } from '../utilities/openTabs';

export async function goToReferences(request: SidecarGoToReferencesRequest): Promise<SidecarGoToRefernecesResponse> {
	const locations: vscode.LocationLink[] = await vscode.commands.executeCommand(
		'vscode.executeReferenceProvider',
		request.fs_file_path,
		request.position,
	);
	const implementations = await Promise.all(locations.map(async (location) => {
		const uri = location.targetUri;
		const range = location.targetRange;
		if (shouldTrackFile(uri)) {
			console.log('we are trakcing this uri');
			console.log(uri);
		}
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
				},
			}
		};
	}));
	return {
		reference_locations: implementations,
	};
}
