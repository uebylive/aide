/**
 * We are going to implement the Quick actions fix class here and invoke the cs-chat
 * to fix things here
 */

import * as vscode from 'vscode';

export class AideQuickFix implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		let codeActions: (vscode.CodeAction | vscode.Command)[] = [];
		if (!vscode.window.activeTextEditor) {
			return codeActions;
		}

		let severeDiagnostics = AideQuickFix.getSevereDiagnostics(context.diagnostics);
		if (severeDiagnostics.length === 0) {
			return codeActions;
		}

		let diagnosticRange = severeDiagnostics.map((diagnostic) => diagnostic.range).reduce((prev, current) => prev.union(current));
		let selection = new vscode.Selection(diagnosticRange.start, diagnosticRange.end);
		let diagnosticsAsText = AideQuickFix.getDiagnosticsAsText(severeDiagnostics);

		let fixCodeAction = new vscode.CodeAction("Fix using Aide", vscode.CodeActionKind.QuickFix);
		fixCodeAction.diagnostics = severeDiagnostics;
		fixCodeAction.command = {
			title: '$(sparkle) ' + fixCodeAction.title,
			command: "vscode.editorCSChat.start",
			arguments: [
				{
					autoSend: true,
					message: `/fix ${diagnosticsAsText}`,
					position: diagnosticRange.start,
					initialSelection: selection,
					initialRange: diagnosticRange,
				},
			],
			tooltip: '$(sparkle) ',
		};
		codeActions.push(fixCodeAction);

		return codeActions;
	}

	private static getSevereDiagnostics(diagnostics: readonly vscode.Diagnostic[]): vscode.Diagnostic[] {
		return diagnostics.filter((diagnostic) => diagnostic.severity <= vscode.DiagnosticSeverity.Warning);
	}

	private static getDiagnosticsAsText(diagnostics: vscode.Diagnostic[]): string {
		return diagnostics.map((diagnostic) => diagnostic.message).join(", ");
	}
}
