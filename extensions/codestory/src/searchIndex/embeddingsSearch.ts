/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { generateEmbeddingFromSentenceTransformers } from '../llm/embeddings/sentenceTransformers';
import { CodeSearchIndexLoadResult, CodeSearchIndexLoadStatus, CodeSearchIndexer, CodeSearchIndexerType, CodeSnippetSearchInformation } from './types';
import { CodeSnippetInformation, CodeSymbolInformationEmbeddings } from '../utilities/types';
import * as fs from 'fs';
import * as math from 'mathjs';
import * as path from 'path';
import { ensureDirectoryExists } from './helpers';
import { Progress } from 'vscode';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length !== vecB.length) {
		return -1;
	}

	const dotProduct = math.dot(vecA, vecB);
	const magnitudeA = math.norm(vecA);
	const magnitudeB = math.norm(vecB);

	return dotProduct / ((magnitudeA as number) * (magnitudeB as number));
}

async function loadCodeSymbolDescriptionFromLocalStorage(
	globalStorageUri: string,
	remoteSession: string,
): Promise<CodeSymbolInformationEmbeddings[]> {
	const directoryPath = path.join(
		globalStorageUri,
		remoteSession,
		'code_symbol_sentence_transformer',
		'descriptions',
	);
	let files: string[] = [];
	try {
		files = await fs.promises.readdir(directoryPath);
	} catch (err) {
		console.log('[loadCodeSymbolDescriptionFromLocalStorage] error');
		console.log(err);
		// We failed to read from the directory path, so lets bail hard here
		return [];
	}
	const codeSymbolInformationEmbeddingsList: CodeSymbolInformationEmbeddings[] = [];
	for (let index = 0; index < files.length; index++) {
		const file = files[index];
		const filePath = path.join(directoryPath, file);
		try {
			const fileContent = await fs.promises.readFile(filePath);
			const codeSymbolInformationEmbeddings = JSON.parse(fileContent.toString()) as CodeSymbolInformationEmbeddings;
			codeSymbolInformationEmbeddingsList.push(codeSymbolInformationEmbeddings);
		} catch (error) {
			// We missed loading a code symbol, that's fine for now, lets keep going
			// we should be logging this to posthog
			// TODO(codestory): log to posthog here
		}
	}
	return codeSymbolInformationEmbeddingsList;
}

export async function storeCodeSymbolDescriptionToLocalStorage(
	codeSymbolName: string,
	remoteSession: string,
	globalStorageUri: string,
	data: CodeSymbolInformationEmbeddings
) {
	const filePath = path.join(
		globalStorageUri,
		remoteSession,
		'code_symbol_sentence_transformer',
		'descriptions',
		codeSymbolName
	);
	await ensureDirectoryExists(filePath);
	// Now we have ensured the directory exists we can safely write to it
	try {
		await fs.promises.writeFile(filePath, JSON.stringify(data));
		console.log('Successfully wrote file: ' + filePath);
	} catch (err) {
		console.error('Error writing file: ' + (err as Error).toString());
	}
}


const generateCodeSymbolEmbeddingsForFiles = async (
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	workingDirectory: string,
	filesToTrack: string[],
	progress: Progress<{
		message?: string | undefined;
		increment?: number | undefined;
	}> | null,
	context?: string,
): Promise<CodeSymbolInformationEmbeddings[]> => {
	const crypto = await import('crypto');
	const finalCodeSymbolWithEmbeddings: CodeSymbolInformationEmbeddings[] = [];
	let previousPercentage = 0;
	for (let index = 0; index < filesToTrack.length; index++) {
		const filePath = filesToTrack[index];
		const currentPercentage = Math.floor((index / filesToTrack.length) * 100);
		try {
			const fileContent = await fs.promises.readFile(filePath, 'utf8');
			const fileContentHash = crypto.createHash('sha256').update(fileContent, 'utf8').digest('hex');
			const indexer = codeSymbolsLanguageCollection.getIndexerForFile(filePath);
			if (!indexer) {
				continue;
			}
			const codeSymbols = await indexer.parseFileWithoutDependency(
				filePath,
				workingDirectory,
				false,
			);
			for (let index2 = 0; index2 < codeSymbols.length; index2++) {
				const embeddings = await generateEmbeddingFromSentenceTransformers(
					codeSymbols[index2].codeSnippet.code,
					context ?? 'generateCodeSymbolEmbeddingsForFiles',
				);
				finalCodeSymbolWithEmbeddings.push({
					codeSymbolEmbedding: embeddings,
					codeSymbolInformation: codeSymbols[index2],
					fileHash: fileContentHash,
				});
			}
			if (currentPercentage > previousPercentage && progress !== null) {
				progress.report({
					message: `${currentPercentage}% files indexed`,
					increment: currentPercentage,
				});
				previousPercentage = currentPercentage;
			}
		} catch (err) {

		}
	}
	return finalCodeSymbolWithEmbeddings;
};


export class EmbeddingsSearch extends CodeSearchIndexer {
	private _nodes: CodeSymbolInformationEmbeddings[];
	private _activeFilesTracker: ActiveFilesTracker;
	private _codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection;
	private _storageLocation: string;
	private _repoName: string;
	private _readyToUse: boolean;

	constructor(
		activeFileTracker: ActiveFilesTracker,
		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
		storageLocation: string,
		repoName: string,
	) {
		super();
		this._nodes = [];
		this._activeFilesTracker = activeFileTracker;
		this._codeSymbolsLanguageCollection = codeSymbolsLanguageCollection;
		this._storageLocation = storageLocation;
		this._repoName = repoName;
		this._readyToUse = false;
	}

	async loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult> {
		// Here we will look at the storage location and see if there are any
		// code symbols, if there is that's good, and then also check it against
		// the current hash to find the files which should be re-indexed.
		// short hack but it will make things more consistent
		const crypto = await import('crypto');
		try {
			const codeSymbolEmbeddings = await loadCodeSymbolDescriptionFromLocalStorage(
				this._storageLocation,
				this._repoName,
			);
			// First see what files we were able to get information for and also
			// the hash of the files this symbol belongs to and if its different
			// from the one which is on the disk right now
			const fileToHashMap: Map<string, string> = new Map();
			const filesWhichNeedIndexing: Set<string> = new Set();
			for (let index = 0; index < filesToTrack.length; index++) {
				// get the file hash
				const fileContent = await fs.promises.readFile(filesToTrack[index], 'utf8');
				const fileContentHash = crypto.createHash('sha256').update(fileContent, 'utf8').digest('hex');
				fileToHashMap.set(filesToTrack[index], fileContentHash);
				filesWhichNeedIndexing.add(filesToTrack[index]);
			}

			// which nodes we have to evict, can be many reasons, like the file was
			// modified or deleted or moved etc
			const nodesToEvict: Set<string> = new Set();
			const filesToReIndex: Set<string> = new Set();
			for (let index = 0; index < codeSymbolEmbeddings.length; index++) {
				const codeSymbolEmbedding = codeSymbolEmbeddings[index];
				const currentFilePath = codeSymbolEmbedding.codeSymbolInformation.fsFilePath;
				const currentFileHash = codeSymbolEmbedding.fileHash;
				if (fileToHashMap.has(currentFilePath)) {
					const fileHash = fileToHashMap.get(currentFilePath);
					if (fileHash === currentFileHash) {
						// All good, we keep this as is
						filesWhichNeedIndexing.delete(currentFilePath);
					} else {
						// The file hash has changed, we need to re-index this file
						filesToReIndex.add(currentFilePath);
						nodesToEvict.add(codeSymbolEmbedding.codeSymbolInformation.symbolName);
					}
				} else {
					// We have a deleted file which we are tracking, time to evict this node
					nodesToEvict.add(codeSymbolEmbedding.codeSymbolInformation.symbolName);
				}
			}
			const finalNodes = codeSymbolEmbeddings.filter((node) => {
				if (nodesToEvict.has(node.codeSymbolInformation.symbolName)) {
					return false;
				}
				return true;
			});
			this._nodes = finalNodes;
			filesToReIndex.forEach((file) => {
				filesWhichNeedIndexing.add(file);
			});
			console.log('[embeddingSearch] filesWhichNeedIndexing');
			console.log(filesWhichNeedIndexing);
			return {
				status: CodeSearchIndexLoadStatus.Loaded,
				filesMissing: Array.from(filesWhichNeedIndexing),
			};
		} catch (err) {
			console.log(err);
			// In case of any uncaught error, we want to re-index, its the sad
			// state of the world we live in....
			return {
				status: CodeSearchIndexLoadStatus.Failed,
				filesMissing: filesToTrack,
			};
		}
	}

	async saveCodeSymbolEmbeddingNodes(): Promise<void> {
		for (let index = 0; index < this._nodes.length; index++) {
			await storeCodeSymbolDescriptionToLocalStorage(
				this._nodes[index].codeSymbolInformation.symbolName,
				this._repoName,
				this._storageLocation,
				this._nodes[index],
			);
		}
	}

	async saveToStorage(): Promise<void> {
		// for saving to storage, we are going to save the nodes as they are in
		// the directory
		await this.saveCodeSymbolEmbeddingNodes();
	}

	async indexFile(filePath: string, workingDirectory: string): Promise<void> {
		const codeSymbolWithEmbeddings = await generateCodeSymbolEmbeddingsForFiles(
			this._codeSymbolsLanguageCollection,
			workingDirectory,
			[filePath],
			null,
		);
		this._nodes.push(...codeSymbolWithEmbeddings);
	}

	async indexWorkspace(filesToIndex: string[], workingDirectory: string, progress: Progress<{
		message?: string | undefined;
		increment?: number | undefined;
	}>): Promise<void> {
		const codeSymbolWithEmbeddings = await generateCodeSymbolEmbeddingsForFiles(
			this._codeSymbolsLanguageCollection,
			workingDirectory,
			filesToIndex,
			progress,
			'indexWorkspace',
		);
		this._nodes.push(...codeSymbolWithEmbeddings);
	}

	async search(query: string, limit: number, fileList: string[] | null): Promise<CodeSnippetSearchInformation[]> {
		// do the same thing here as document symbol search and return back
		// code snippet information based on the symbols which are included
		// as part of the file list
		let filteredNodes = [];
		if (fileList) {
			filteredNodes = this._nodes.filter((node) => {
				return fileList.includes(node.codeSymbolInformation.fsFilePath);
			});
		} else {
			filteredNodes = this._nodes;
		}
		const results: CodeSnippetSearchInformation[] = [];
		const queryEmbeddings = await generateEmbeddingFromSentenceTransformers(
			query,
			this.getIndexUserFriendlyName(),
		);
		const nodesWithSimilarity = filteredNodes.map((node) => {
			const nodeEmbeddings = node.codeSymbolEmbedding;
			const cosineResult = cosineSimilarity(queryEmbeddings, nodeEmbeddings);
			return {
				codeSnippetInformation: CodeSnippetInformation.fromCodeSymbolInformation(node.codeSymbolInformation),
				score: cosineResult,
			};
		});
		nodesWithSimilarity.sort((a, b) => {
			return b.score - a.score;
		});
		return nodesWithSimilarity.slice(0, limit);
	}

	async isReadyForUse(): Promise<boolean> {
		return this._readyToUse;
	}

	async refreshIndex(): Promise<void> {
		// do something here
	}

	public updateNodes(nodes: CodeSymbolInformationEmbeddings) {
		this._nodes.push(nodes);
	}

	public async generateNodesRelevantForUser(
		userQuery: string,
		filePathsToSearch?: string[],
	): Promise<CodeSymbolInformationEmbeddings[]> {
		const currentNodes = this._nodes;
		const userQueryEmbedding = await generateEmbeddingFromSentenceTransformers(
			userQuery,
			this.getIndexUserFriendlyName(),
		);

		const nodesWithSimilarity = currentNodes.filter((node) => {
			if (!filePathsToSearch) {
				return true;
			}

			if (node.codeSymbolInformation.fsFilePath in filePathsToSearch) {
				return true;
			}
			return false;
		}).map((node) => {
			const similarity = cosineSimilarity(
				userQueryEmbedding,
				node.codeSymbolEmbedding,
			);
			return {
				node,
				similarity,
			};
		});

		nodesWithSimilarity.sort((a, b) => {
			return b.similarity - a.similarity;
		});

		return nodesWithSimilarity.slice(0, 10).map((nodeWithSimilarity) => {
			return nodeWithSimilarity.node;
		});
	}

	public async generateNodesRelevantForUserFromFiles(
		userQuery: string,
		filePathsToSearch?: string[],
		trackAll: boolean = false,
	): Promise<CodeSymbolInformationEmbeddings[]> {
		// So here we have to find the code symbols from the open files which
		// are relevant for the user query
		const interestingNodes = this._nodes.filter((node) => {
			if (filePathsToSearch) {
				if (!filePathsToSearch.includes(node.codeSymbolInformation.fsFilePath)) {
					return false;
				}
				if (trackAll) {
					return true;
				}
			}
			const activeFiles = this._activeFilesTracker.getActiveFiles();
			const activeFile = activeFiles.find((file) => {
				return file === node.codeSymbolInformation.fsFilePath;
			});
			if (activeFile) {
				return true;
			}
			return false;
		});

		const userQueryEmbedding = await generateEmbeddingFromSentenceTransformers(
			userQuery,
			this.getIndexUserFriendlyName(),
		);

		const nodesWithSimilarity = interestingNodes.map((node) => {
			const similarity = cosineSimilarity(
				userQueryEmbedding,
				node.codeSymbolEmbedding,
			);
			return {
				node,
				similarity,
			};
		});

		nodesWithSimilarity.sort((a, b) => {
			return b.similarity - a.similarity;
		});

		// For the nodes from open files we prefer 20 over the the normal 10
		return nodesWithSimilarity.slice(0, 10).map((nodeWithSimilarity) => {
			return nodeWithSimilarity.node;
		});
	}

	public async generateNodesForUserQuery(
		userQuery: string,
		filePathsToSearch?: string[],
	): Promise<CodeSymbolInformationEmbeddings[]> {
		const nodesFromAllOverTheCodeBase = await this.generateNodesRelevantForUser(
			userQuery,
			filePathsToSearch,
		);
		const nodesFromActiveFiles = await this.generateNodesRelevantForUserFromFiles(
			userQuery,
			filePathsToSearch,
		);
		// Now we sort and merge these together
		const alreadySeenFiles: Set<string> = new Set();
		for (let index = 0; index < nodesFromActiveFiles.length; index++) {
			alreadySeenFiles.add(nodesFromActiveFiles[index].codeSymbolInformation.fsFilePath);
		}
		const filteredNodesFromTheCodebase: CodeSymbolInformationEmbeddings[] = [];
		for (let index = 0; index < nodesFromAllOverTheCodeBase.length; index++) {
			const node = nodesFromAllOverTheCodeBase[index];
			if (!alreadySeenFiles.has(node.codeSymbolInformation.fsFilePath)) {
				filteredNodesFromTheCodebase.push(node);
			}
		}
		const mergedNodes = [
			...nodesFromActiveFiles,
			...filteredNodesFromTheCodebase,
		];
		return mergedNodes;
	}

	async markReadyToUse(): Promise<void> {
		this._readyToUse = true;
	}

	getIndexUserFriendlyName(): string {
		return 'embeddings';
	}

	getCodeSearchIndexerType(): CodeSearchIndexerType {
		return CodeSearchIndexerType.CodeSymbolBased;
	}

	getIndexerAccuracy(): number {
		// How are we choosing this number? by hand-waving
		return 0.8;
	}
}
