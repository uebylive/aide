/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarDiagnosticsResponse, SidecarQuickFixResponse } from './types';
import { quickFixList } from './quickFix';
import { SidecarQuickFixRequest } from './types';


export async function getFileDiagnosticsFromEditor(
	filePath: string,
	withSuggestions: boolean = false
): Promise<EnhancedSidecarDiagnosticsResponse[]> {
	const fileUri = vscode.Uri.file(filePath);
	let diagnostics = vscode.languages.getDiagnostics(fileUri);

	// .filter((diagnostic) =>
	// 	diagnostic.severity === vscode.DiagnosticSeverity.Error ||
	// 	diagnostic.severity === vscode.DiagnosticSeverity.Warning
	// );

	console.log({ diagnostics })

	const enhancedDiagnostics = await Promise.all(
		diagnostics.map(async (diagnostic) => {
			const fullMessage = await getFullDiagnosticMessage(diagnostic);
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

			// todo(zi) - consider what to do with editor url and request_id wtf
			let quick_fix_request: SidecarQuickFixRequest = {
				fs_file_path: fileUri.fsPath,
				editor_url: "editor url",
				range,
				request_id: "request_id",
			};

			const quickFixes = await quickFixList(quick_fix_request);
			const suggestions = withSuggestions ? await getSuggestions(fileUri, diagnostic.range) : [];
			const parameter_hints = await getParameterHints(fileUri, diagnostic.range.end); // end is the trigger point

			console.log({ parameter_hints })

			return {
				message: fullMessage ?? diagnostic.message,
				range,
				quickFixes,
				suggestions,
				signature_help: parameter_hints,
			};
		})
	);

	console.log({ enhancedDiagnostics });

	return enhancedDiagnostics;
}

async function getParameterHints(
	fileUri: vscode.Uri,
	position: vscode.Position
): Promise<vscode.SignatureHelp | undefined> {
	try {
		const signatureHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
			'vscode.executeSignatureHelpProvider',
			fileUri,
			position
		);

		console.log({ signatureHelp })

		if (!signatureHelp || signatureHelp.signatures.length === 0) {
			console.log('No signature help available at the given position.');
			return undefined;
		}

		const activeSignature = signatureHelp.signatures[signatureHelp.activeSignature];

		console.log({
			activeSignature: signatureHelp.activeSignature,
			activeParameter: signatureHelp.activeParameter,
			signatureLabel: activeSignature.label,
			parameters: activeSignature.parameters.map(param => param.label),
			documentation: activeSignature.documentation
				? (typeof activeSignature.documentation === 'string'
					? activeSignature.documentation
					: activeSignature.documentation.value)
				: 'No documentation available'
		});

		return signatureHelp;
	} catch (error) {
		console.error('Error fetching signature help:', error);
		return undefined;
	}
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
	quickFixes: SidecarQuickFixResponse;
	suggestions: vscode.CompletionItem[];
	signature_help: vscode.SignatureHelp | undefined;
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
