/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FileCodeSymbolInformation, CodeSnippetInformation } from '../../utilities/types';
import { CodeSymbolsLanguageCollection } from '../../languages/codeSymbolsLanguageCollection';
import { SearchIndexCollection } from '../../searchIndex/collection';

// Helper functions for the agent to do search over the codebase and pick the
// most relevant parts of the code

export const generateCodeSymbolsForQueries = async (
	queries: string[],
	searchIndexCollection: SearchIndexCollection,
	userProvidedContext: vscode.InteractiveUserProvidedContext | undefined,
): Promise<CodeSnippetInformation[]> => {
	const alreadySeenSymbols: Set<string> = new Set();
	const finalCodeSnippetList: CodeSnippetInformation[] = [];
	if (userProvidedContext === undefined) {
		for (let index = 0; index < queries.length; index++) {
			const searchResults = await searchIndexCollection.searchQuery(queries[index], 20, null);
			for (let index = 0; index < searchResults.length; index++) {
				const searchResult = searchResults[index];
				const codeSnippetName = searchResult.codeSnippetInformation.getNameForSnippet();
				if (!alreadySeenSymbols.has(codeSnippetName)) {
					alreadySeenSymbols.add(codeSnippetName);
					finalCodeSnippetList.push(searchResult.codeSnippetInformation);
				}
			}
		}
	}
	// Also use the user provided context here so we can prioritize those symbols
	if (userProvidedContext) {
		for (let index = 0; index < userProvidedContext.codeSymbolsContext.length; index++) {
			const userQuery = userProvidedContext.codeSymbolsContext[index].documentSymbolName;
			const searchResults = await searchIndexCollection.searchQuery(
				userQuery,
				20,
				[userProvidedContext.codeSymbolsContext[index].filePath],
			);
			if (searchResults.length > 0) {
				const codeSnippetInformation = searchResults[0];
				if (!alreadySeenSymbols.has(codeSnippetInformation.codeSnippetInformation.getNameForSnippet())) {
					alreadySeenSymbols.add(codeSnippetInformation.codeSnippetInformation.getNameForSnippet());
					finalCodeSnippetList.push(codeSnippetInformation.codeSnippetInformation);
				}
			}
		}
	}
	return finalCodeSnippetList;
};

export const generateFileInformationSummary = async (
	codeSnippetInformationList: CodeSnippetInformation[],
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	userProvidedContext: vscode.InteractiveUserProvidedContext | undefined,
	workingDirectory: string
): Promise<FileCodeSymbolInformation[]> => {
	// We want to get all the files being referenced here and then take all
	// the code symbols from there and pass it to the prompt for searching
	const fileCodeSymbolInformationList: FileCodeSymbolInformation[] = [];
	const fileSet: Set<string> = new Set();
	for (let index = 0; index < codeSnippetInformationList.length; index++) {
		fileSet.add(codeSnippetInformationList[index].filePath);
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
