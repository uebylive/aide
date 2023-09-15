/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeSymbolsIndexer } from './codeSymbolsIndexerTypes';


// We want to keep a collection of the various indexers we are using and pass that
// along, instead of passing things individually.
export class CodeSymbolsLanguageCollection {
	_indexers: Map<string, CodeSymbolsIndexer> = new Map();
	constructor() {
	}

	addCodeIndexerForType(type: string, codeIndexer: CodeSymbolsIndexer) {
		this._indexers.set(type, codeIndexer);
	}

	getCodeIndexerForType(type: string): CodeSymbolsIndexer | undefined {
		return this._indexers.get(type);
	}

	getIndexerForFile(filePath: string): CodeSymbolsIndexer | undefined {
		const extension = filePath.split('.').pop();
		if (!extension) {
			return undefined;
		}
		for (const [_, indexer] of this._indexers) {
			if (indexer.supportedFileFormats.includes(extension)) {
				return indexer;
			}
		}
		return undefined;
	}
}
