/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// What's fast indexing?
// Fast indexing is us looking at the code symbols present in a file using the
// DocumentSymbolProvider API. We use this to build a summary of the file
// and do a fast search.
// This will allow us to search for things quickly before we do a real search
// based on the code symbols.
// We need to make sure that this is really fast and run some benchmarks to make
// sure we are not blocking the extension in any way.

import { DocumentSymbol, SymbolInformation, SymbolKind, TextDocument, languages, workspace } from 'vscode';


// TODO(codestory): Why 5? Its a good number I guess but also gives a good representation of the
// overall structure of the file, we should tweak it per language, for example in
// rust we also have tests in the same file and mod tests will show up here too.
const MAX_NUM_OF_SYMBOLS = 5;


const TIMED_OUT = 'Timed out';

// TODO(codestory): Take language into account and return a new priority
// for it later on
const getPriorityForSymbolKind = (kind: SymbolKind): number => {
	if (SymbolKind.Module === kind) {
		return 1;
	}
	if (SymbolKind.Namespace === kind) {
		return 2;
	}
	if (SymbolKind.Class === kind) {
		return 3;
	}
	if (SymbolKind.Interface === kind) {
		return 4;
	}
	if (SymbolKind.Function === kind) {
		return 5;
	}
	if (SymbolKind.Method === kind) {
		return 6;
	}
	if (SymbolKind.Variable === kind) {
		return 7;
	}
	if (SymbolKind.Constant === kind) {
		return 8;
	}
	if (SymbolKind.Enum === kind) {
		return 10;
	}
	if (SymbolKind.Property === kind) {
		return 11;
	}
	return 5;
};


const sortDocumentSymbolsByKind = (symbols: DocumentSymbol[]): DocumentSymbol[] => {
	// Sort the tags by priority, fallback to their original order for equal priorities
	const sortedSymbols = symbols.sort((a, b) => {
		const priorityA = getPriorityForSymbolKind(a.kind);
		const priorityB = getPriorityForSymbolKind(b.kind);

		if (priorityA === priorityB) {
			return symbols.indexOf(a) - symbols.indexOf(b);
		} else {
			return priorityA - priorityB;
		}
	});
	return sortedSymbols;
};


const filterOurDocumentSymbols = (symbols: DocumentSymbol[]): DocumentSymbol[] => {
	return Array.from(symbols.filter((symbol) => {
		if (symbol.kind === SymbolKind.Variable) {
			return false;
		}
		// If the signature is pretty small, we can ignore it
		if (symbol.detail !== '' && symbol.detail.length <= 10) {
			return false;
		}
		return true;
	}));
};


const getFileRepresentation = (symbols: DocumentSymbol[], filePath: string): string => {
	const finalSymbolsToUse = sortDocumentSymbolsByKind(
		filterOurDocumentSymbols(symbols),
	).splice(MAX_NUM_OF_SYMBOLS);
	let representationString = `${filePath}\n`;
	for (let index = 0; index < finalSymbolsToUse.length; index++) {
		const symbol = finalSymbolsToUse[index];
		let symbolInformation = '';
		if (symbol.detail !== '') {
			symbolInformation = `${SymbolKind[symbol.kind]} ${symbol.name}:${symbol.detail}\n`;
		} else {
			symbolInformation = `${SymbolKind[symbol.kind]} ${symbol.name}\n`;
		}
		representationString += symbolInformation;
	}
	return representationString;
};



export class DocumentSymbolBasedIndex {
	private fileToIndexMap: Map<string, string> = new Map();
	constructor() {
		this.fileToIndexMap = new Map();
	}

	async indexFile(filePath: string) {
		// create an index for this file
		let textDocument: TextDocument | undefined;
		const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms, TIMED_OUT));
		workspace.textDocuments.forEach((document) => {
			if (document.uri.fsPath === filePath) {
				textDocument = document;
			}
		});
		if (!textDocument) {
			return;
		}
		const documentSymbolProviders = languages.getDocumentSymbolProvider(
			// Placeholder text here, we don't really filter for anything
			// here
			'typescript'
		);

		for (let index = 0; index < documentSymbolProviders.length; index++) {
			try {
				const symbols = await Promise.race([
					documentSymbolProviders[index].provideDocumentSymbols(
						textDocument,
						{
							isCancellationRequested: false,
							onCancellationRequested: () => ({ dispose() { } }),
						},
					),
					timeout(3000)
				]);

				// if promise timed out, continue to next iteration
				if (symbols === TIMED_OUT) {
					continue;
				}

				const castedSymbols = symbols as DocumentSymbol[] | undefined | null;
				if (castedSymbols === undefined || castedSymbols === null) {
					continue;
				}
				if (castedSymbols.length === 0) {
					continue;
				}
				const representationString = getFileRepresentation(castedSymbols, filePath);
				this.fileToIndexMap.set(filePath, representationString);
				// Now we have to take this array and convert it to a representation
				// of the symbol which will work
			} catch (e) {
				console.log('[DocumentSymbolBasedIndex] Error while indexing file');
				console.error(e);
			}
		}
	}
}
