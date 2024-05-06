/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function getDiagnosticsFromEditor(filePath: string, interestedRange: vscode.Range): vscode.Diagnostic[] {
	const fileUri = vscode.Uri.file(filePath);
	const diagnostics = vscode.languages.getDiagnostics(fileUri);
	diagnostics.filter((diagnostic) => {
		return interestedRange.contains(diagnostic.range);
	});
	return diagnostics;
}
