/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// Create a tree-sitter parser collection which loads the relevant wasm files
// as required or says that they don't exist
import * as path from 'path';
import * as fs from 'fs';
import { CodeSnippetInformation, Span } from '../utilities/types';
import { CodeSearchIndexLoadResult, CodeSearchIndexLoadStatus, CodeSearchIndexer, CodeSearchIndexerType, CodeSnippetSearchInformation } from './types';
import { Progress } from 'vscode';
import { generateEmbeddingFromSentenceTransformers } from '../llm/embeddings/sentenceTransformers';
import math from 'mathjs';
import { ensureDirectoryExists } from './helpers';
const Parser = require('web-tree-sitter');

function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length !== vecB.length) {
		return -1;
	}

	const dotProduct = math.dot(vecA, vecB);
	const magnitudeA = math.norm(vecA);
	const magnitudeB = math.norm(vecB);

	return dotProduct / ((magnitudeA as number) * (magnitudeB as number));
}

const extensionToLanguageMap: Map<string, string> = new Map([
	['go', 'go'],
	['py', 'python'],
	['js', 'typescript'],
	['ts', 'typescript'],
	['tsx', 'typescript'],
	['jsx', 'typescript'],
	['rb', 'ruby'],
	['cpp', 'cpp'],
]);

export class TreeSitterParserCollection {
	private _treeSitterParsers: Map<string, any>;
	private _triedToInitialize: Map<string, boolean>;
	constructor() {
		this._treeSitterParsers = new Map();
		this._triedToInitialize = new Map();
	}

	async addParserForExtension(fileExtension: string): Promise<void> {
		this._triedToInitialize.set(fileExtension, true);
		if (this._treeSitterParsers.has(fileExtension)) {
			return;
		}
		const language = extensionToLanguageMap.get(fileExtension);
		if (!language) {
			return;
		}
		try {
			await Parser.init();
			const parser = new Parser();
			const filePath = path.join(__dirname, 'treeSitterWasm', (`tree-sitter-${language}.wasm`));
			const languageParser = await Parser.Language.load(filePath);
			parser.setLanguage(languageParser);
			this._treeSitterParsers.set(fileExtension, parser);
		} catch (e) {
			console.log(e);
		}
	}

	async getParserForExtension(fileExtension: string): Promise<any | null | undefined> {
		if (!this._triedToInitialize.has(fileExtension)) {
			await this.addParserForExtension(fileExtension);
		}
		return this._treeSitterParsers.get(fileExtension);
	}
}

function nonWhitespaceLen(s: string): number {
	return s.replace(/\s/g, '').length;
}

function getLineNumber(index: number, sourceCode: string): number {
	let totalChars = 0;
	const lines = sourceCode.split('\n');
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		totalChars += lines[lineNumber].length;
		if (totalChars > index) {
			return lineNumber;
		}
	}
	return lines.length;
}

// This is the most important function here, where we generate spans from the
// code using tree-sitter to power the search
function chunkTree(tree: any, sourceCode: string, MAX_CHARS = 512 * 3, coalesce = 50): Span[] {
	// 1. Recursively form chunks based on the last post(https://docs.sweep.dev/blogs/chunking-2m-files)
	function chunkNode(node: any): {
		chunks: Span[];
		currentChunk: Span;
	} {
		const chunks: Span[] = [];
		let currentChunk: Span = new Span(node.startIndex, node.startIndex);
		const nodeChildren = node.children;
		for (const child of nodeChildren) {
			if (child.endIndex - child.startIndex > MAX_CHARS) {
				chunks.push(currentChunk);
				currentChunk = new Span(child.endIndex, child.endIndex);
				chunks.push(...chunkNode(child).chunks);
			} else if (child.endIndex - child.startIndex + (currentChunk.end - currentChunk.start) > MAX_CHARS) {
				chunks.push(currentChunk);
				currentChunk = new Span(child.startIndex, child.endIndex);
			} else {
				currentChunk = new Span(currentChunk.start, child.endIndex);
			}
		}
		chunks.push(currentChunk);
		return {
			chunks,
			currentChunk
		};
	}

	const chunkNodeOutput = chunkNode(tree.rootNode);
	const chunks = chunkNodeOutput.chunks;
	// const currentChunk = chunkNodeOutput.currentChunk;

	// 2. Filling in the gaps
	if (chunks.length === 0) {
		return [];
	}
	if (chunks.length < 2) {
		return [new Span(0, chunks[0].end - chunks[0].start)];
	}
	for (let i = 0; i < chunks.length - 1; i++) {
		chunks[i].end = chunks[i + 1].start;
	}

	// 3. Combining small chunks with bigger ones
	const newChunks = [];
	let currentChunk: Span = new Span(0, 0);
	for (const chunk of chunks) {
		currentChunk = new Span(currentChunk.start, chunk.end);
		if (nonWhitespaceLen(currentChunk.extract(sourceCode)) > coalesce && sourceCode.slice(currentChunk.start, currentChunk.end).includes('\n')) {
			newChunks.push(currentChunk);
			currentChunk = new Span(chunk.end, chunk.end);
		}
	}
	if (currentChunk.end - currentChunk.start > 0) {
		newChunks.push(currentChunk);
	}

	// 4. Changing line numbers and Eliminating empty chunks
	const lineChunks = newChunks.map(chunk => {
		return new Span(
			getLineNumber(chunk.start, sourceCode),
			getLineNumber(chunk.end, sourceCode),
		);
	}).filter(chunk => chunk.end - chunk.start > 0);

	// 5. Coalescing last chunk if it's too small
	if (lineChunks.length > 1 && lineChunks[lineChunks.length - 1].end - lineChunks[lineChunks.length - 1].start < coalesce) {
		lineChunks[lineChunks.length - 2].end = lineChunks[lineChunks.length - 1].end;
		lineChunks.pop();
	}

	return lineChunks;
}


// If we can't parse it using tree-sitter, the best fallback is to use
// line-based chunking instead and get it to work.
// peak #m clowntown
const MAX_LINES_FOR_SPLIT = 30;
const MAX_OVERLAP = 15;

function lineBasedChunking(
	code: string,
	lineCount: number = MAX_LINES_FOR_SPLIT,
	overlap: number = MAX_OVERLAP,
): string[] {
	if (overlap >= lineCount) {
		throw new Error('Overlap should be smaller than lineCount.');
	}

	const lines = code.split('\n');
	const totalLines = lines.length;
	const chunks: string[] = [];

	let start = 0;
	while (start < totalLines) {
		const end = Math.min(start + lineCount, totalLines);
		const chunk = lines.slice(start, end).join('\n');
		chunks.push(chunk);
		start += lineCount - overlap;
	}

	return chunks;
}


export const chunkCodeFile = async (
	filePath: string,
	maxCharacters: number,
	coalesce: number,
	treeSitterParserCollection: TreeSitterParserCollection,
): Promise<{
	snippets: CodeSnippetInformation[];
	fileHash: string;
}> => {
	// Now we are going to pick the relevant tree-sitter library here and ship
	// that instead.
	// We want to get the tree-sitter wasm libraries for as many languages as we
	// can and keep them at the same place so we can do span based chunking
	// and power our search
	const fileExtension = path.extname(filePath).slice(1);
	let code: string = '';
	try {
		code = await fs.promises.readFile(filePath, 'utf-8');
	} catch (err) {
		console.log('[chunkCodeFile] error while reading file');
		console.log(filePath);
		console.log(err);
	}
	const crypto = await import('crypto');
	const hash = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
	const parser = await treeSitterParserCollection.getParserForExtension(fileExtension);
	if (parser === null || parser === undefined) {
		// we fallback to the naive model
		const chunks = lineBasedChunking(
			code,
			maxCharacters,
			coalesce,
		);
		const snippets: CodeSnippetInformation[] = [];
		for (let index = 0; index < chunks.length; index++) {
			snippets.push(new CodeSnippetInformation(
				chunks[index],
				index * 30,
				(index + 1) * 30,
				filePath,
				null,
				null,
				null,
				null,
			));
		}
		return {
			snippets,
			fileHash: hash,
		};
	} else {
		const parsedNode = parser.parse(code);
		console.log(`[chunkCodeFile] parsed node: ${filePath}`);
		const chunks = chunkTree(parsedNode, code, maxCharacters, coalesce);
		// convert this span to snippets now
		const snippets = chunks.map((chunk) => {
			return new CodeSnippetInformation(
				chunk.extractLines(code),
				chunk.start,
				chunk.end,
				filePath,
				null,
				null,
				null,
				null,
			);
		});
		return {
			snippets,
			fileHash: hash,
		};
	}
};


// This is what we will be storing as a representation of this chunk
export interface TreeSitterChunkInformation {
	codeSnippetInformation: CodeSnippetInformation;
	embeddings: number[];
	filePath: string;
	fileHash: string;
}


export const getNameForTreeSitterChunkInformation = (
	treeSitterChunkInformation: TreeSitterChunkInformation,
): string => {
	return `${treeSitterChunkInformation.codeSnippetInformation.filePath.split(path.sep).join('=')}-${treeSitterChunkInformation.codeSnippetInformation.start}-${treeSitterChunkInformation.codeSnippetInformation.end}`;
};


async function loadTreeSitterChunkInformationFromLocalStorage(
	globalStorageUri: string,
	remoteSession: string,
): Promise<TreeSitterChunkInformation[]> {
	const directoryPath = path.join(
		globalStorageUri,
		remoteSession,
		'treeSitterBasedChunking',
	);
	let files: string[] = [];
	try {
		files = await fs.promises.readdir(directoryPath);
	} catch (err) {
		return [];
	}
	const treeSitterChunkInformationList: TreeSitterChunkInformation[] = [];
	for (let index = 0; index < files.length; index++) {
		const file = files[index];
		const filePath = path.join(directoryPath, file);
		try {
			const fileContent = await fs.promises.readFile(filePath, 'utf-8');
			const treeSitterChunkInformation = JSON.parse(fileContent) as TreeSitterChunkInformation;
			treeSitterChunkInformationList.push(treeSitterChunkInformation);
		} catch (err) {
			// TODO(codestory): log to posthog, but leave it as it is right now
		}
	}
	return treeSitterChunkInformationList;
}


export class TreeSitterChunkingBasedIndex extends CodeSearchIndexer {
	private _treeSitterParserCollection: TreeSitterParserCollection;
	private _storageLocation: string;
	private _repoName: string;
	private _nodes: TreeSitterChunkInformation[];
	private _isReadyToUse: boolean;

	constructor(
		repoName: string,
		storageLocation: string,
	) {
		super();
		this._repoName = repoName;
		this._storageLocation = storageLocation;
		this._treeSitterParserCollection = new TreeSitterParserCollection();
		this._nodes = [];
		this._isReadyToUse = false;
	}

	async loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult> {
		const storagePath = path.join(this._storageLocation, this._repoName, 'treeSitterBasedChunking');
		try {
			const _ = await fs.promises.access(storagePath, fs.constants.F_OK);
		} catch (e) {
			return {
				status: CodeSearchIndexLoadStatus.NotPresent,
				filesMissing: filesToTrack,
			};
		}

		// now we will load from the local storage, that the path exists so
		// its all good
		const crypto = await import('crypto');
		try {
			const treeSitterChunks = await loadTreeSitterChunkInformationFromLocalStorage(
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
			for (let index = 0; index < treeSitterChunks.length; index++) {
				const treeSitterChunkInformation = treeSitterChunks[index];
				const currentFilePath = treeSitterChunkInformation.codeSnippetInformation.filePath;
				const currentFileHash = treeSitterChunkInformation.fileHash;
				if (fileToHashMap.has(currentFilePath)) {
					const fileHash = fileToHashMap.get(currentFilePath);
					if (fileHash === currentFileHash) {
						// All good, we keep this as is
						filesWhichNeedIndexing.delete(currentFilePath);
					} else {
						// The file hash has changed, we need to re-index this file
						filesToReIndex.add(currentFilePath);
						nodesToEvict.add(getNameForTreeSitterChunkInformation(treeSitterChunkInformation));
					}
				} else {
					filesToReIndex.add(currentFilePath);
					// We have a deleted file which we are tracking, time to evict this node
					nodesToEvict.add(getNameForTreeSitterChunkInformation(treeSitterChunkInformation));
				}
			}
			const finalNodes = treeSitterChunks.filter((treeSitterChunk) => {
				if (nodesToEvict.has(getNameForTreeSitterChunkInformation(treeSitterChunk))) {
					return false;
				}
				return true;
			});
			this._nodes = finalNodes;
			filesToReIndex.forEach((file) => {
				filesWhichNeedIndexing.add(file);
			});
			return {
				status: CodeSearchIndexLoadStatus.Loaded,
				filesMissing: Array.from(filesWhichNeedIndexing),
			};
		} catch (err) {
			console.log('[treeSitterChunkingBasedIndex] error while loading from storage');
			console.log(err);
			return {
				status: CodeSearchIndexLoadStatus.Failed,
				filesMissing: filesToTrack,
			};
		}
	}

	async saveTreeSitterChunksToLocalStorage(): Promise<void> {
		// console.log('[indexing][saveTreeSitterChunksToLocalStorage] saving to local storage');
		console.log(this._nodes.length);
		for (let index = 0; index < this._nodes.length; index++) {
			// console.log('[indexing][saveTreeSitterChunksToLocalStorage] saving to local storage');
			const nodeName = getNameForTreeSitterChunkInformation(this._nodes[index]);
			const finalStoragePath = path.join(
				this._storageLocation,
				this._repoName,
				'treeSitterBasedChunking',
				nodeName,
			);
			await ensureDirectoryExists(finalStoragePath);
			try {
				await fs.promises.writeFile(
					finalStoragePath,
					JSON.stringify(this._nodes[index]),
				);
				// console.log('[saveTreeSitterChunksToLocalStorage] saved to local storage');
				console.log(finalStoragePath);
			} catch (err) {
				// console.error('[saveTreeSitterChunksToLocalStorage] error while saving to local storage');
				console.error(this._nodes[index]);
				console.error(err);
			}
		}
	}

	async saveToStorage(): Promise<void> {
		this.saveTreeSitterChunksToLocalStorage();
	}

	async refreshIndex(): Promise<void> {
		// TODO(codestory): Think about what we can do here
		return;
	}

	async indexFile(filePath: string, workingDirectory: string): Promise<void> {
		const treeSitterChunkedNodes = await chunkCodeFile(
			filePath,
			1500,
			100,
			this._treeSitterParserCollection,
		);
		const treeSitterNodes = treeSitterChunkedNodes.snippets;
		const finalNodes: TreeSitterChunkInformation[] = [];
		for (let index = 0; index < treeSitterNodes.length; index++) {
			const embeddings = await generateEmbeddingFromSentenceTransformers(
				treeSitterNodes[index].content,
				this.getIndexUserFriendlyName() + filePath,
			);
			finalNodes.push({
				codeSnippetInformation: treeSitterNodes[index],
				embeddings,
				filePath: treeSitterNodes[index].filePath,
				fileHash: treeSitterChunkedNodes.fileHash,
			});
		}
		this._nodes.push(...finalNodes);
	}

	async indexWorkspace(filesToIndex: string[], workingDirectory: string, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
		let previousPercentage = 0;
		for (let index = 0; index < filesToIndex.length; index++) {
			const currentPercentage = Math.floor((index / filesToIndex.length) * 100);
			try {
				if (currentPercentage !== previousPercentage) {
					progress.report({
						message: `${currentPercentage}%`,
						increment: currentPercentage / 100,
					});
					previousPercentage = currentPercentage;
				}
				await this.indexFile(filesToIndex[index], workingDirectory);
			} catch (err) {

			}
		}
	}

	async search(query: string, limit: number, fileList: string[] | null): Promise<CodeSnippetSearchInformation[]> {
		let filteredNodes = [];
		if (fileList) {
			filteredNodes = this._nodes.filter((node) => {
				return fileList.includes(node.filePath);
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
			const nodeEmbeddings = node.embeddings;
			const cosineResult = cosineSimilarity(queryEmbeddings, nodeEmbeddings);
			return {
				codeSnippetInformation: node.codeSnippetInformation,
				score: cosineResult,
			};
		});
		nodesWithSimilarity.sort((a, b) => {
			return b.score - a.score;
		});
		return nodesWithSimilarity.slice(0, limit);
	}

	async isReadyForUse(): Promise<boolean> {
		return this._isReadyToUse;
	}

	async markReadyToUse(): Promise<void> {
		this._isReadyToUse = true;
		return;
	}

	getIndexUserFriendlyName(): string {
		return 'tree-sitter';
	}

	getCodeSearchIndexerType(): CodeSearchIndexerType {
		return CodeSearchIndexerType.CodeSnippetBased;
	}

	getIndexerAccuracy(): number {
		return 0.8;
	}
}


// void (async () => {
// 	const treeSitterParserCollection = new TreeSitterParserCollection();
// 	const snippets = await chunkCodeFile(
// 		'/Users/skcd/scratch/ide/extensions/codestory/src/searchIndex/treeSitterParsing.ts',
// 		1500,
// 		100,
// 		treeSitterParserCollection,
// 	);
// 	console.log(snippets);
// })();
