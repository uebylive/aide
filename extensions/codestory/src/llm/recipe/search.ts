/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ActiveFilesTracker } from '../../activeChanges/activeFilesTracker';
import { EmbeddingsSearch } from '../../codeGraph/embeddingsSearch';
import { CodeSymbolInformation, FileCodeSymbolInformation } from '../../utilities/types';
import { CodeSymbolsLanguageCollection } from '../../languages/codeSymbolsLanguageCollection';

// Helper functions for the agent to do search over the codebase and pick the
// most relevant parts of the code

export const generateCodeSymbolsForQueries = async (
	queries: string[],
	embeddingsSearch: EmbeddingsSearch,
	userProvidedContext: vscode.InteractiveUserProvidedContext | undefined,
): Promise<CodeSymbolInformation[]> => {
	const alreadySeenSymbols: Set<string> = new Set();
	const finalCodeSymbolList: CodeSymbolInformation[] = [];
	if (userProvidedContext === undefined) {
		for (let index = 0; index < queries.length; index++) {
			const query = queries[index];
			const codeSymbols = await embeddingsSearch.generateNodesForUserQuery(query);
			console.log(`We found ${codeSymbols.length} code symbols for query ${query}`);
			console.log(codeSymbols.map(
				(codeSymbol) => codeSymbol.codeSymbolInformation.symbolName
			));
			for (let index = 0; index < codeSymbols.length; index++) {
				const codeSymbol = codeSymbols[index];
				if (!alreadySeenSymbols.has(codeSymbol.codeSymbolInformation.symbolName)) {
					alreadySeenSymbols.add(codeSymbol.codeSymbolInformation.symbolName);
					finalCodeSymbolList.push(codeSymbol.codeSymbolInformation);
				}
			}
		}
	}
	// Also use the user provided context here so we can prioritize those symbols
	if (userProvidedContext) {
		for (let index = 0; index < userProvidedContext.codeSymbolsContext.length; index++) {
			const userQuery = userProvidedContext.codeSymbolsContext[index].documentSymbolName;
			const codeSymbolsFromFile = await embeddingsSearch.generateNodesRelevantForUserFromFiles(
				userQuery,
				[
					userProvidedContext.codeSymbolsContext[index].filePath,
				],
				true,
			);
			if (codeSymbolsFromFile.length > 0) {
				const codeSymbolInterested = codeSymbolsFromFile[0];
				if (!alreadySeenSymbols.has(codeSymbolInterested.codeSymbolInformation.symbolName)) {
					alreadySeenSymbols.add(codeSymbolInterested.codeSymbolInformation.symbolName);
					finalCodeSymbolList.push(codeSymbolInterested.codeSymbolInformation);
				}
			}
		}
	}
	return finalCodeSymbolList;
};

export const generateFileInformationSummary = async (
	codeSymbolInformationList: CodeSymbolInformation[],
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	userProvidedContext: vscode.InteractiveUserProvidedContext | undefined,
	workingDirectory: string
): Promise<FileCodeSymbolInformation[]> => {
	// We want to get all the files being referenced here and then take all
	// the code symbols from there and pass it to the prompt for searching
	const fileCodeSymbolInformationList: FileCodeSymbolInformation[] = [];
	const fileSet: Set<string> = new Set();
	for (let index = 0; index < codeSymbolInformationList.length; index++) {
		fileSet.add(codeSymbolInformationList[index].fsFilePath);
	}
	if (userProvidedContext !== undefined) {
		for (let index = 0; index < userProvidedContext.fileContext.length ?? 0; index++) {
			fileSet.add(userProvidedContext.fileContext[index]);
		}
	}

	const fileList: string[] = Array.from(fileSet);

	// Now that we have the fspath for each of them, we can generate the
	// file code symbol information
	for (let index = 0; index < fileList.length; index++) {
		// get the file extension
		const fileExtension = fileList[index].split('.').reverse()[0];
		const indexerForFile = codeSymbolsLanguageCollection.getIndexerForFile(fileList[index]);
		if (!indexerForFile) {
			continue;
		}
		const codeSymbols = await indexerForFile.parseFileWithDependencies(
			fileList[index],
			workingDirectory,
			false,
		);
		fileCodeSymbolInformationList.push({
			filePath: fileList[index],
			codeSymbols: codeSymbols,
			workingDirectory: workingDirectory,
		});
	}
	return fileCodeSymbolInformationList;
};
