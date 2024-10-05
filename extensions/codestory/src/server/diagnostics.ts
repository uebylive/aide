/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarDiagnosticsResponse, SidecarQuickFixRequest, SidecarQuickFixResponse } from './types';
import { quickFixList } from './quickFix';

interface DiagnosticFilter {
	(diagnostic: vscode.Diagnostic): boolean
}

export async function getFileDiagnosticsFromEditor(
	filePath: string,
	filters: DiagnosticFilter[] = [],
	withSuggestions: boolean = false
): Promise<EnhancedSidecarDiagnosticsResponse[]> {
	const fileUri = vscode.Uri.file(filePath);
	let diagnostics = vscode.languages.getDiagnostics(fileUri);

	// Apply filters if provided
	diagnostics = filters.reduce((filtered, filter) => filtered.filter(filter), diagnostics);

	const enhancedDiagnostics = await Promise.all(
		diagnostics.map(async (diagnostic) => {
			const [fullMessage, enhancements] = await Promise.all([
				getFullDiagnosticMessage(diagnostic),
				getEnhancements(fileUri, diagnostic, withSuggestions)
			]);
			const range = {
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
			};

			return {
				message: fullMessage ?? diagnostic.message,
				range,
				...enhancements,
			};
		})
	);

	return enhancedDiagnostics;
}

async function getEnhancements(
	fileUri: vscode.Uri,
	diagnostic: vscode.Diagnostic,
	withSuggestions: boolean
): Promise<{
	quickFixes: SidecarQuickFixResponse | null;
	suggestions: vscode.CompletionItem[];
	parameter_hints: vscode.SignatureInformation[];
}> {
	if (!withSuggestions) {
		return {
			quickFixes: null,
			suggestions: [],
			parameter_hints: [],
		};
	}
	const range = {
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
	};
	const quick_fix_request: SidecarQuickFixRequest = {
		fs_file_path: fileUri.fsPath,
		editor_url: 'editor url', // TODO: Implement proper editor URL
		range,
		request_id: 'request_id', // TODO: Implement proper request ID generation
	};
	const [quickFixes, suggestions, parameter_hints] = await Promise.all([
		quickFixList(quick_fix_request),
		getSuggestions(fileUri, diagnostic.range),
		getParameterHints(fileUri, diagnostic.range.start),
	]);
	return { quickFixes, suggestions, parameter_hints };
}
async function getParameterHints(
	fileUri: vscode.Uri,
	position: vscode.Position
): Promise<vscode.SignatureInformation[]> {
	const signatureHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
		'vscode.executeSignatureHelpProvider',
		fileUri,
		position
	);
	return signatureHelp.signatures
}
async function getSuggestions(fileUri: vscode.Uri, range: vscode.Range): Promise<vscode.CompletionItem[]> {
	const suggestions = await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider',
		fileUri,
		range.start
	);
	return suggestions?.items ?? [];
}

interface EnhancedSidecarDiagnosticsResponse extends SidecarDiagnosticsResponse {
	quickFixes: SidecarQuickFixResponse | null;  // Changed from SidecarQuickFixResponse to SidecarQuickFixResponse | null
	suggestions: vscode.CompletionItem[];
	parameter_hints: vscode.SignatureInformation[];
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
