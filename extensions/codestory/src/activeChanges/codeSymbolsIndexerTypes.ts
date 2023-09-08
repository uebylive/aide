/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeSymbolInformation } from '../utilities/types';


export abstract class CodeSymbolsIndexer {
	private supportedFileFormats: string[];
	private indexerType: string;

	constructor(indexerType: string, supportedFileFormats: string[]) {
		this.supportedFileFormats = supportedFileFormats;
		this.indexerType = indexerType;
	}

	// We can use this function to parse the file and get the code symbols
	// without the dependencies.
	abstract parseFileWithoutDependency(filePath: string, storeInCache: boolean): Promise<CodeSymbolInformation[]>;

	// We can use this function to parse the file and get the code symbols
	// with dependencies. This is useful when we want to get the complete information
	// about the code symbol and how its linked together in the codebase.
	abstract parseFileWithDependencies(filePath: string, storeInCache: boolean): Promise<CodeSymbolInformation[]>;
}
