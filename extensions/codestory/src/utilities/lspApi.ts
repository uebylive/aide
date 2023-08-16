// Here we are going to store all the LSP apis we get access to.

import { DocumentSymbol, Position, SymbolInformation, Uri, languages, workspace } from 'vscode';
import logger from '../logger';
import { sleep } from './sleep';
import * as fs from 'fs';
import { CodeSymbolInformation } from './types';


function isSymbolInformationArray(symbols: SymbolInformation[] | DocumentSymbol[]): symbols is SymbolInformation[] {
	// Assuming SymbolInformation has a unique property 'location'
	return (symbols.length > 0 && 'containerName' in symbols[0]);
}


function isDocumentSymbolArray(symbols: SymbolInformation[] | DocumentSymbol[]): symbols is DocumentSymbol[] {
	// Assuming DocumentSymbol has a unique property 'detail'
	return (symbols.length > 0 && 'children' in symbols[0]);
}

const convertDocumentSymbolOutputToCodeSymbol = (
	workingDirectory: string,
	documentSymbols: SymbolInformation[] | DocumentSymbol[]
): CodeSymbolInformation[] => {
	const codeSymbols: CodeSymbolInformation[] = [];
	if (isSymbolInformationArray(documentSymbols)) {
		for (let index = 0; index < documentSymbols.length; index++) {
			const symbolInformation = documentSymbols[index];
		}
	}
	if (isDocumentSymbolArray(documentSymbols)) {
		for (let index = 0; index < documentSymbols.length; index++) {
			const documentInformation = documentSymbols[index];
		}
	}
	return [];
};


export const getDocumentSymbols = async () => {
	await sleep(1000);
	logger.info("[document-symbols-testing] we are here");
	const documentSymbolProviders = languages.getDocumentSymbolProvider(
		"typescript"
	);
	logger.info("[document-symbol-providers] length " + documentSymbolProviders.length);
	const uri = Uri.file('/Users/skcd/scratch/anton/anton/llm/tool_event_collection.py');
	const textDocument = await workspace.openTextDocument(uri);
	logger.info("[text documents]");
	logger.info(textDocument.getText());
	for (let index = 0; index < documentSymbolProviders.length; index++) {
		const documentSymbols = await documentSymbolProviders[index].provideDocumentSymbols(
			textDocument,
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose() { } }),
			},
		);
		// Now we want to write this to a file
		if (documentSymbols?.length === 0) {
			logger.info("[document-symbols-testing] no symbols found");
			continue;
		}
		logger.info("[document-symbols-testing]");
		logger.info(documentSymbols);
		fs.writeFileSync("/tmp/documentSymbols", JSON.stringify(documentSymbols), 'utf-8');
	}
};

export const lspHacking = async () => {
	await sleep(1000);
	const documentSymbolProviders = languages.getDocumentSymbolProvider(
		"typescript"
	);
	logger.info("[document-symbol-providers golang]");
	logger.info(documentSymbolProviders);
	const uri = Uri.file('/Users/skcd/test_repo/ripgrep/crates/core/logger.rs');
	const textDocument = await workspace.openTextDocument(uri);
	for (let index = 0; index < documentSymbolProviders.length; index++) {
		logger.info("[text documents]");
		logger.info(workspace.textDocuments.map(document => document.uri.fsPath));
		if (textDocument) {
			logger.info("[textDocuments]");
			const documentSymbols = await documentSymbolProviders[index].provideDocumentSymbols(
				textDocument,
				{
					isCancellationRequested: false,
					onCancellationRequested: () => ({ dispose() { } }),
				},
			);
			logger.info("[symbolsDocument]");
			logger.info(documentSymbols?.map((symbol) => symbol.name));
		} else {
			logger.info("file not found");
		}
	}
	logger.info("[document-symbol-providers] " + documentSymbolProviders.length);


	const providers = languages.getDefinitionProvider({
		language: "typescript",
		scheme: "file",
	});
	logger.info("[providers for language ss]" + providers.length);
	for (let index = 0; index < providers.length; index++) {
		logger.info("asking for definitions");
		try {
			const definitions = await providers[index].provideDefinition(
				textDocument,
				new Position(37, 29),
				{
					isCancellationRequested: false,
					onCancellationRequested: () => ({ dispose() { } }),
				}
			);
			logger.info("[definitions sss]");
			logger.info(definitions);
		} catch (e) {
			logger.info(e);
		}
	}

	const referencesProviders = languages.getReferenceProvider({
		language: "typescript",
		scheme: "file",
	});
	logger.info("[references for language ss]" + referencesProviders.length);
	for (let index = 0; index < referencesProviders.length; index++) {
		try {
			logger.info("asking for references");
			const references = await referencesProviders[index].provideReferences(
				textDocument,
				new Position(25, 16),
				{
					includeDeclaration: true,
				},
				{
					isCancellationRequested: false,
					onCancellationRequested: () => ({ dispose() { } }),
				}
			);
			logger.info("[references sss]");
			logger.info(references);
		} catch (e) {
			logger.info(e);
		}
	}
};
