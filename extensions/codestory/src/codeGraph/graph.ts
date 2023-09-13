/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { getFilesTrackedInWorkingDirectory } from '../git/helper';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { CodeSymbolInformation } from '../utilities/types';
import { EventEmitter } from 'events';

// What do we need from the code graph:
// A way to visualize what the code symbol connections look like (we are talking
// in terms of code symbols and not code snippets here)
// 1. Lazy loading so if we want to get information about a file, we should be
// able to get the following quickly: references and the code symbols and the
// go to definitions (going 1 level and parsing the asked file is also fine)
// 2. force input: if the user has asked for a specific file, we should be able
// to get the information by force (run it again)
// 3. we need the complete graph for the change tracker: This is pretty expensive
// to create at runtime, but we can figure something out for this too, the reason
// is: code symbols are not just directly related A -> B, there might be A -> B -> C
// kind of relations and we would still want to group them together
//
// TODO(codestory):
// - figure out how to do fast loading, we will bias towards looking at git log for the git user
// and looking at the recent changes in the last 2 weeks, and one for all the commits in the last
// 2 weeks
// - we need to build the force load file option in the code graph so its primed up and ready
// - make it load completely for the whole code base (this can keep happening in the background)
// need to take care of the changes which come in at the same time we are building (making this a bit
// non-trivial)


export enum CodeGraphFileState {
	// Deep indexed is when we have the dependency and the references indexed
	// for the current file
	DeepIndexed,
	// Shallow indexed is when we have just the code symbols but not the dependencies
	// indexed (so dependencies are missing from the code symbols and we should
	// not rely on them)
	ShallowIndexed,
	// as the name says...
	NotIndexed,
}


export interface FileState {
	filePath: string;
	fileHash: string;
	codeGraphState: CodeGraphFileState;
}


export class CodeGraph {
	private _fileToCodeSymbolMapped: Map<string, FileState>;
	private _activeFilesTracker: ActiveFilesTracker;
	private _nodes: CodeSymbolInformation[];

	constructor(activeFilesTracker: ActiveFilesTracker) {
		this._nodes = [];
		this._fileToCodeSymbolMapped = new Map();
		this._activeFilesTracker = activeFilesTracker;
	}

	public addNodes(nodes: CodeSymbolInformation[]) {
		this._nodes.push(...nodes);
	}

	public getNodeByLastName(
		lastName: string,
	): CodeSymbolInformation[] | null {
		const nodes = this._nodes.filter(
			(node) => {
				const symbolName = node.symbolName;
				const splittedSymbolName = symbolName.split('.').reverse();
				let accumulator = '';
				for (let index = 0; index < splittedSymbolName.length; index++) {
					const element = splittedSymbolName[index];
					if (index === 0) {
						accumulator = element;
						if (accumulator === lastName) {
							return true;
						}
					} else {
						accumulator = `${element}.${accumulator}`;
						if (accumulator === lastName) {
							return true;
						}
					}
				}
				return false;
			},
		);
		if (nodes.length === 0) {
			return null;
		}
		return nodes;
	}

	public getNodeFromLineRangeAndFile(
		filePath: string,
		lineNumber: number,
	): CodeSymbolInformation | null {
		const nodes = this._nodes.filter(
			(node) => {
				if (node.fsFilePath === filePath) {
					if (node.symbolStartLine <= lineNumber && node.symbolEndLine >= lineNumber) {
						return true;
					}
				}
				return false;
			},
		);
		if (nodes.length === 0) {
			return null;
		}
		return nodes[0];
	}

	public getReferenceLocationsForCodeSymbol(
		node: CodeSymbolInformation,
	): CodeSymbolInformation[] {
		const references: CodeSymbolInformation[] = [];
		const nodeSymbolsForReference: Set<string> = new Set();
		for (const currentNode of this._nodes) {
			for (const edges of currentNode.dependencies) {
				console.log(edges.edges.map((edge) => edge.codeSymbolName));
				console.log(edges.edges.map((edge) => edge.codeSymbolName).includes(node.symbolName));
				if (edges.edges.map((edge) => edge.codeSymbolName).includes(node.symbolName)) {
					if (nodeSymbolsForReference.has(currentNode.symbolName) === false) {
						references.push(currentNode);
						nodeSymbolsForReference.add(currentNode.symbolName);
					}
				}
			}
		}
		return references;
	}
}


const parseFilesForCodeSymbols = async (
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	workingDirectory: string,
	filesToCheck: string[],
	emitter: EventEmitter,
): Promise<CodeSymbolInformation[]> => {
	const codeSymbolInformationList: CodeSymbolInformation[] = [];
	for (let index = 0; index < filesToCheck.length; index++) {
		const file = filesToCheck[index];
		const codeIndexer = codeSymbolsLanguageCollection.getIndexerForFile(file);
		if (codeIndexer === undefined) {
			continue;
		}
		const codeSymbols = await codeIndexer.parseFileWithDependencies(
			file,
			workingDirectory,
			true,
		);
		emitter.emit('partialData', codeSymbols);
		codeSymbolInformationList.push(...codeSymbols);
	}
	return codeSymbolInformationList;
};


export const generateCodeGraph = async (
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	workingDirectory: string,
	emitter: EventEmitter,
	activeFileTracker: ActiveFilesTracker,
): Promise<CodeGraph> => {
	const filesToTrack = await getFilesTrackedInWorkingDirectory(
		workingDirectory,
	);
	const finalNodeList: CodeSymbolInformation[] = [];
	const codeSymbols = await parseFilesForCodeSymbols(
		codeSymbolsLanguageCollection,
		workingDirectory,
		filesToTrack,
		emitter,
	);
	finalNodeList.push(...codeSymbols);
	const codeGraph = new CodeGraph(activeFileTracker);
	codeGraph.addNodes(finalNodeList);
	return codeGraph;
};
