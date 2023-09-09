/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We have to generate the graph of the codebase here, so we can query for nodes
import { getFilesTrackedInWorkingDirectory } from '../git/helper';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { CodeSymbolInformation } from '../utilities/types';
import { EventEmitter } from 'events';


export class CodeGraph {
	private _nodes: CodeSymbolInformation[];

	constructor(nodes: CodeSymbolInformation[]) {
		this._nodes = nodes;
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
	return new CodeGraph(finalNodeList);
};
