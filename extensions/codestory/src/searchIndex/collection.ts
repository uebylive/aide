/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { ProgressLocation, window } from 'vscode';
import { CodeSnippetSearchInformation, CodeSearchIndexLoadStatus, CodeSearchIndexer, CodeSearchIndexerType } from './types';
import { isExcludedExtension } from '../utilities/extensionBlockList';


const shouldRunIndexing = (indexerState: CodeSearchIndexLoadStatus): boolean => {
	if (indexerState === CodeSearchIndexLoadStatus.Loaded) {
		return false;
	}
	return true;
};


export const shouldParseFile = async (filePath: string): Promise<boolean> => {
	try {
		const extension = path.extname(filePath);
		if (isExcludedExtension(extension)) {
			return false;
		}
		if (extension === '.js') {
			// check if there exists the same file with .ts extension, if it does
			// then this is a generated file and we should not be indexing this
			const fileExtension = path.extname(filePath);
			const fileName = path.basename(filePath, fileExtension);
			const directoryName = path.dirname(filePath);
			const tsFilePath = path.join(directoryName, `${fileName}.ts`);
			// check if file exists using fs async
			try {
				await fs.promises.access(tsFilePath);
				return false;
			} catch (err) {
				return true;
			}
		}
		return true;
	} catch (err) {
		return true;
	}
};


export class SearchIndexCollection {
	private _indexers: CodeSearchIndexer[];
	private _workingDirectory: string;
	// Map of map here, we are mapping indexer name to the file path timestamp
	// of last index
	private _lastIndexedTimestampForIndexer: Map<string, Map<string, number>>;

	constructor(workingDirectory: string) {
		this._indexers = [];
		this._workingDirectory = workingDirectory;
		this._lastIndexedTimestampForIndexer = new Map();
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
			const finalFilesToIndex: string[] = [];
			for (let index = 0; index < filesToIndex.length; index++) {
				const shouldParse = await shouldParseFile(filesToIndex[index]);
				if (shouldParse) {
					finalFilesToIndex.push(filesToIndex[index]);
				}
			}
			// We are not marking this as async because we want this to run in
			// the background while the other indexers are also starting up
			// async here is important to kick start this in the background
			indexer.loadFromStorage(finalFilesToIndex).then(async (loadedFromStorage) => {
				await window.withProgress(
					{
						location: ProgressLocation.Window,
						title: `[CodeStory] ${indexer.getIndexUserFriendlyName()} Indexing`,
						cancellable: false,
					},
					async (progress, token) => {
						console.log(`[loadedFromStorage][status][${indexer.getIndexUserFriendlyName()}]`);
						console.log(loadedFromStorage);
						if (shouldRunIndexing(loadedFromStorage.status)) {
							await indexer.indexWorkspace(finalFilesToIndex, this._workingDirectory, progress);
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

	public async searchQuery(query: string, limit: number, fileList: string[] | null): Promise<CodeSnippetSearchInformation[]> {
		// I know this is dumb, because we can have multiple indexers of the same type
		// but this is fine for now, we will figure out how to model this properly later
		// on.
		const indexerResult: Map<CodeSearchIndexerType, CodeSnippetSearchInformation[]> = new Map();
		for (const indexer of this._indexers) {
			const isReady = await indexer.isReadyForUse();
			if (!isReady) {
				continue;
			}
			// This is wrong here, we should be combining the results from
			// all the indexers, but for now its fine
			const results = await indexer.search(query, limit, fileList);
			const indexerType = indexer.getCodeSearchIndexerType();
			results.forEach((result) => {
				result.score = result.score * indexer.getIndexerAccuracy();
			});
			indexerResult.set(indexerType, results);
			if (results.length > 0) {
				return results;
			}
		}

		const codeSnippetSearchInformationFinalResults: CodeSnippetSearchInformation[] = [];
		// Now we have to multiply the score of the code snippets with the file weight
		// which we are getting. There can be various combinations of this, but for now
		// this is fine
		const fileLevelFinalResults: CodeSnippetSearchInformation[] = [];
		const filePathScore: Map<string, number> = new Map();
		for (const [indexerType, results] of indexerResult) {
			if (indexerType === CodeSearchIndexerType.FileBased) {
				for (const result of results) {
					fileLevelFinalResults.push(result);
					const filePath = result.codeSnippetInformation.filePath;
					filePathScore.set(filePath, result.score);
				}
			}
		}

		let codeSymbolBasedIndexerPresent = false;
		// Now we look at the code symbol based embeddings and add that part of the
		// score to the code symbol based ones
		for (const [indexerType, results] of indexerResult) {
			if (indexerType === CodeSearchIndexerType.CodeSymbolBased) {
				codeSymbolBasedIndexerPresent = true;
				for (const result of results) {
					const filePath = result.codeSnippetInformation.filePath;
					const fileCurrentScore = filePathScore.get(filePath);
					if (fileCurrentScore) {
						result.score = result.score * fileCurrentScore;
						codeSnippetSearchInformationFinalResults.push(result);
					} else {
						codeSnippetSearchInformationFinalResults.push(result);
					}
				}
			}
		}

		if (!codeSymbolBasedIndexerPresent) {
			return fileLevelFinalResults;
		}
		return codeSnippetSearchInformationFinalResults;
	}

	public async indexFile(filePath: string) {
		const shouldIndexFile = await shouldParseFile(filePath);
		if (!shouldIndexFile) {
			return;
		}
		for (const indexer of this._indexers) {
			const isIndexerReady = await indexer.isReadyForUse();
			if (!isIndexerReady) {
				continue;
			}
			const indexerName = indexer.getIndexUserFriendlyName();
			if (!this._lastIndexedTimestampForIndexer.has(indexerName)) {
				this._lastIndexedTimestampForIndexer.set(indexerName, new Map());
			}
			const lastIndexedTimestampForIndexer = this._lastIndexedTimestampForIndexer.get(indexerName)!;
			const lastIndexedTimestamp = lastIndexedTimestampForIndexer.get(filePath);
			if (lastIndexedTimestamp) {
				const currentTime = Date.now();
				// We wait  3 seconds before triggering a re-indexing
				// as it can very heavy
				if (currentTime - lastIndexedTimestamp < 3 * 1000) {
					continue;
				}
				lastIndexedTimestampForIndexer.set(filePath, Date.now());
				await indexer.indexFile(filePath, this._workingDirectory);
			} else {
				lastIndexedTimestampForIndexer.set(filePath, Date.now());
				await indexer.indexFile(filePath, this._workingDirectory);
			}
		}
	}
}
