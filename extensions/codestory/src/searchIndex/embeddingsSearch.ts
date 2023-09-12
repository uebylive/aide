/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { generateEmbeddingFromSentenceTransformers } from '../llm/embeddings/sentenceTransformers';
import { CodeSearchIndexLoadResult, CodeSearchIndexLoadStatus, CodeSearchIndexer, CodeSnippetSearchInformation } from '../searchIndex/types';
import { CodeSymbolInformationEmbeddings } from '../utilities/types';
import * as math from 'mathjs';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length !== vecB.length) {
		return -1;
	}

	const dotProduct = math.dot(vecA, vecB);
	const magnitudeA = math.norm(vecA);
	const magnitudeB = math.norm(vecB);

	return dotProduct / ((magnitudeA as number) * (magnitudeB as number));
}

export class EmbeddingsSearch extends CodeSearchIndexer {
	private _nodes: CodeSymbolInformationEmbeddings[];
	private _activeFilesTracker: ActiveFilesTracker;
	private _codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection;
	private _storageLocation: string;

	constructor(
		nodes: CodeSymbolInformationEmbeddings[],
		activeFileTracker: ActiveFilesTracker,
		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
		storageLocation: string,
	) {
		super();
		this._nodes = nodes;
		this._activeFilesTracker = activeFileTracker;
		this._codeSymbolsLanguageCollection = codeSymbolsLanguageCollection;
		this._storageLocation = storageLocation;
	}

	async loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult> {
		// do something here
		return {
			status: CodeSearchIndexLoadStatus.Loaded,
			filesMissing: [],
		};
	}

	async saveToStorage(): Promise<void> {
		// do something here
	}

	async indexFile(filePath: string): Promise<void> {
		// do something here
	}

	async indexWorkspace(filesToIndex: string[]): Promise<void> {
		// do something here
	}

	async search(query: string, limit: number): Promise<CodeSnippetSearchInformation[]> {
		// do something here
		return [];
	}

	async isReadyForUse(): Promise<boolean> {
		return true;
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
		const userQueryEmbedding = await generateEmbeddingFromSentenceTransformers(userQuery);

		const nodesWithSimilarity = currentNodes.filter((node) => {
			if (!filePathsToSearch) {
				return true;
			}

			if (node.codeSymbolInformation.fsFilePath in filePathsToSearch) {
				return true;
			}
			return false;
		}).map((node) => {
			console.log('Whats the current node we are going to search', node);
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

		const userQueryEmbedding = await generateEmbeddingFromSentenceTransformers(userQuery);

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
}
