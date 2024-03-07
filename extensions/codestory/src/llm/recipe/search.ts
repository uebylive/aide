/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileCodeSymbolInformation, CodeSnippetInformation } from '../../utilities/types';
import { CodeSymbolsLanguageCollection } from '../../languages/codeSymbolsLanguageCollection';


export const generateFileInformationSummary = async (
	codeSnippetInformationList: CodeSnippetInformation[],
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	workingDirectory: string
): Promise<FileCodeSymbolInformation[]> => {
	// We want to get all the files being referenced here and then take all
	// the code symbols from there and pass it to the prompt for searching
	const fileCodeSymbolInformationList: FileCodeSymbolInformation[] = [];
	const fileSet: Set<string> = new Set();
	for (let index = 0; index < codeSnippetInformationList.length; index++) {
		fileSet.add(codeSnippetInformationList[index].filePath);
	}

	const fileList: string[] = Array.from(fileSet);

	// Now that we have the fspath for each of them, we can generate the
	// file code symbol information
	for (let index = 0; index < fileList.length; index++) {
		// get the file extension
		// const fileExtension = fileList[index].split('.').reverse()[0];
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
