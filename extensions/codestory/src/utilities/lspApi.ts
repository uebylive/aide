// Here we are going to store all the LSP apis we get access to.

import { Position, Uri, languages, workspace } from 'vscode';
import logger from '../logger';
import { sleep } from './sleep';

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
