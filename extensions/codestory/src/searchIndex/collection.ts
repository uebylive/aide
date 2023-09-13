/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, window } from 'vscode';
import { CodeSnippetSearchInformation, CodeSearchIndexLoadStatus, CodeSearchIndexer } from './types';


const shouldRunIndexing = (indexerState: CodeSearchIndexLoadStatus): boolean => {
	if (indexerState === CodeSearchIndexLoadStatus.Loaded) {
		return false;
	}
	return true;
};


export class SearchIndexCollection {
	private _indexers: CodeSearchIndexer[];
	private _workingDirectory: string;

	constructor(workingDirectory: string) {
		this._indexers = [];
		this._workingDirectory = workingDirectory;
	}

	public addIndexer(indexer: CodeSearchIndexer) {
		this._indexers.push(indexer);
	}

	public async startupIndexers(filesToIndex: string[]) {
		// startup things here
		for (const indexer of this._indexers) {
			const isReady = await indexer.isReadyForUse();
			if (isReady) {
				continue;
			}
			// We are not marking this as async because we want this to run in
			// the background while the other indexers are also starting up
			// async here is important to kick start this in the background
			indexer.loadFromStorage(filesToIndex).then(async (loadedFromStorage) => {
				await window.withProgress(
					{
						location: ProgressLocation.Window,
						title: `[CodeStory] ${indexer.getIndexUserFriendlyName()} Indexing`,
						cancellable: false,
					},
					async (progress, token) => {
						console.log('[loadedFromStorage]');
						console.log(loadedFromStorage);
						if (shouldRunIndexing(loadedFromStorage.status)) {
							await indexer.indexWorkspace(filesToIndex, this._workingDirectory, progress);
						}
						const missingFiles = loadedFromStorage.filesMissing;
						let incrementIndex = 0;
						const totalLength = missingFiles.length;
						for (const missingFile of missingFiles) {
							incrementIndex = incrementIndex + 1;
							progress.report({
								message: `${incrementIndex}/${totalLength}`,
								increment: incrementIndex / totalLength,
							});
							await indexer.indexFile(missingFile, this._workingDirectory);
						}
						await indexer.saveToStorage();
						indexer.markReadyToUse();
					}
				);
			});
		}
	}

	public async searchQuery(query: string, limit: number): Promise<CodeSnippetSearchInformation[]> {
		for (const indexer of this._indexers) {
			const isReady = await indexer.isReadyForUse();
			if (!isReady) {
				continue;
			}
			// This is wrong here, we should be combining the results from
			// all the indexers, but for now its fine
			const results = await indexer.search(query, limit);
			if (results.length > 0) {
				return results;
			}
		}
		return [];
	}
}
