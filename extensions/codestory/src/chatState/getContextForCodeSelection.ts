/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// We use this module to grab the relevant context for the code selection, this
// will allow us to better explain code and also as a feeder for the higher
// level context which is required when generating explanation

import * as vscode from 'vscode';
import { CodeGraph } from '../codeGraph/graph';
import { CodeSymbolInformation } from '../utilities/types';


export interface SelectionReferenceData {
	documentFilePath: string;
	currentSelection: string;
	currentCodeSymbol: CodeSymbolInformation;
	symbolUsedInReferences: CodeSymbolInformation[];
}


export const getRelevantContextForCodeSelection = (
	codeGraph: CodeGraph,
): SelectionReferenceData | null => {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return null;
	}
	const document = editor.document;
	const selection = editor.selection;

	if (selection.start.line === selection.end.line && selection.start.character === selection.end.character) {
		return null;
	}
	const fsFilePath = document.uri.fsPath;
	const possibleSymbol = codeGraph.getNodeFromLineRangeAndFile(
		fsFilePath,
		selection.start.line + 1,
	);
	if (possibleSymbol === null) {
		return null;
	}
	// Now we want to get the symbols where this is referenced
	const references = codeGraph.getReferenceLocationsForCodeSymbol(possibleSymbol);
	return {
		documentFilePath: fsFilePath,
		currentSelection: document.getText(selection),
		currentCodeSymbol: possibleSymbol,
		symbolUsedInReferences: references,
	};
};


export const createContextPrompt = (selectionReferenceData: SelectionReferenceData): string => {
	return `
You are given the context for the following code snippet:
${selectionReferenceData.currentSelection}

The code snippet belongs to the following code symbol:
${selectionReferenceData.currentCodeSymbol.symbolName}
<code_snippet_for_symbol>
${selectionReferenceData.currentCodeSymbol.codeSnippet.code}
</code_snippet_for_symbol>

The code symbol is used in other parts of the codebase, you can use this to get a higher level understanding of how the code symbol is used in the codebase:
<code_symbol_references>
${selectionReferenceData.symbolUsedInReferences.map((reference) => {
		return `<code_symbol_name>${reference.symbolName}</code_symbol_name>\n<code_snippet_for_symbol>${reference.codeSnippet.code}</code_snippet_for_symbol>\n`;
	})}
</code_symbol_references>

Remember to be concise and explain the code like a professor in computer science, use the references provided to quote how its used in the codebase.
	`;
};
