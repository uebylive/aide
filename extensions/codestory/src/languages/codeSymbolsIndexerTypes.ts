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

	abstract parseFileWithoutDependency(filePath: string, storeInCache: boolean): Promise<CodeSymbolInformation[]>;

	abstract parseFileWithDependency(filePath: string, storeInCache: boolean): Promise<CodeSymbolInformation[]>;
}
