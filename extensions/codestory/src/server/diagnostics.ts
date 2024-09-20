/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarDiagnosticsResponse } from './types';

export function getDiagnosticsFromEditor(filePath: string, interestedRange: vscode.Range): SidecarDiagnosticsResponse[] {
	const fileUri = vscode.Uri.file(filePath);
	const diagnostics = vscode.languages.getDiagnostics(fileUri);

	console.log({ diagnostics })

	diagnostics.forEach(diagnostic => {
		getFullDiagnosticMessage(diagnostic);
	});

	function getFullDiagnosticMessage(diagnostic: vscode.Diagnostic) {
		const code = diagnostic.code;
		if (typeof code === 'object' && code !== null) {
			const targetUri = code.target;
			if (targetUri) {
				vscode.workspace.openTextDocument(targetUri).then(document => {
					const content = document.getText();
					console.log('Full Diagnostic Message:', content);
					// Process the content as needed
				});
			} else {
				console.log('No target URI found in diagnostic code.');
			}
		} else {
			console.log('Diagnostic code is not an object with a target URI.');
		}
	}

	const sidecarDiagnostics = diagnostics.filter((diagnostic) => {
		return interestedRange.contains(diagnostic.range);
	}).filter((diagnostic) => {
		return (diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning);
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
