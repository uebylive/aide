/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarDiagnosticsResponse } from './types';

interface DiagnosticFilter {
	(diagnostic: vscode.Diagnostic): boolean
}

export async function getFileDiagnosticsFromEditor(
	filePath: string,
	filters: DiagnosticFilter[] = []
): Promise<SidecarDiagnosticsResponse[]> {
	const fileUri = vscode.Uri.file(filePath);
	let diagnostics = vscode.languages.getDiagnostics(fileUri);

	// Apply filters if provided
	filters.forEach(filter => {
		diagnostics = diagnostics.filter(filter);
	});

	const sidecarDiagnostics = await Promise.all(
		diagnostics.map(async (diagnostic) => {
			// attempt to get full message - could be null
			const full_message = await getFullDiagnosticMessage(diagnostic);
			return {
				message: full_message ?? diagnostic.message, // message is full_message if exists
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
		})
	);
	return sidecarDiagnostics;
}

export async function getDiagnosticsFromEditor(filePath: string, interestedRange: vscode.Range): Promise<SidecarDiagnosticsResponse[]> {
	const fileUri = vscode.Uri.file(filePath);
	const diagnostics = vscode.languages.getDiagnostics(fileUri);

	const sidecarDiagnostics = await Promise.all(
		diagnostics
			.filter((diagnostic) => interestedRange.contains(diagnostic.range))
			.filter((diagnostic) =>
				diagnostic.severity === vscode.DiagnosticSeverity.Error ||
				diagnostic.severity === vscode.DiagnosticSeverity.Warning
			)
			.map(async (diagnostic) => {
				const full_message = await getFullDiagnosticMessage(diagnostic);
				return {
					message: full_message ?? diagnostic.message, // message is full_message if exists
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
			})
	);
	return sidecarDiagnostics;
}


async function getFullDiagnosticMessage(diagnostic: vscode.Diagnostic): Promise<string | null> {
	const code = diagnostic.code;
	if (typeof code === 'object' && code !== null) {
		const targetUri = code.target;
		if (targetUri) {
			try {
				const document = await vscode.workspace.openTextDocument(targetUri);
				console.log('Diagnostic document found. Happy.')
				const document_text = document.getText();
				return document_text;
			} catch (error) {
				console.error(`Error opening document: ${error}`);
				return null;
			}
		} else {
			console.log('No target URI found in diagnostic code.');
			return null;
		}
	} else {
		console.log('Diagnostic code is not an object with a target URI.');
		return null;
	}
}
