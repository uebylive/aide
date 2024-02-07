// We figure out here if a completion is multiline or not.
import * as vscode from 'vscode';

export async function isMultiline(
	document: vscode.TextDocument,
	position: vscode.Position,
	isMiddleOfLine: boolean,
): Promise<boolean> {
	// TODO(skcd): Implement this properly later on, there are certain conditions
	// based on tree sitter that we can use to determine if a completion is multiline
	if (document.lineCount > 800) {
		return false;
	}
	if (!isMiddleOfLine) {

	}
	if (isMiddleOfLine) {

	}
	return true;
}
