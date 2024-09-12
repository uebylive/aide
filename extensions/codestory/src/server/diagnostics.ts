/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarDiagnosticsResponse } from './types';

export function getDiagnosticsFromEditor(filePath: string, interestedRange: vscode.Range): SidecarDiagnosticsResponse[] {
	const fileUri = vscode.Uri.file(filePath);
	const diagnostics = vscode.languages.getDiagnostics(fileUri);
	const sidecarDiagnostics = diagnostics.filter((diagnostic) => {
		return interestedRange.contains(diagnostic.range);
	}).map((diagnostic) => {
		return {
			message: diagnostic.message,
			range: {
				startPosition: {
					line: diagnostic.range.start.line,
					character: diagnostic.range.start.character,
					byteOffset: 0,
				},
				endPosition: {
					line: diagnostic.range.end.line,
					character: diagnostic.range.end.character,
					byteOffset: 0,
				},
			},
		};
	});
	return sidecarDiagnostics;
}
