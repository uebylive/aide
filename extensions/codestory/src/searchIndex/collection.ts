/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeSymbolsIndexer } from '../languages/codeSymbolsIndexerTypes';


class SearchIndexCollection {
	private _indexers: CodeSymbolsIndexer[];
	constructor() {
		this._indexers = [];
	}
}
