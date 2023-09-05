/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We have to generate the graph of the codebase here, so we can query for nodes
import { getFilesTrackedInWorkingDirectory } from '../git/helper';
import { GoLangParser } from '../languages/goCodeSymbols';
import { getCodeSymbolList } from '../storage/indexer';
import { TSMorphProjectManagement, parseFileUsingTsMorph } from '../utilities/parseTypescript';
import { PythonServer } from '../utilities/pythonServerClient';
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
		console.log(`code symbol we are searching for ${node.symbolName}`);
		const references: CodeSymbolInformation[] = [];
		const nodeSymbolsForReference: Set<string> = new Set();
		for (const currentNode of this._nodes) {
			if (currentNode.symbolName === 'src.codeGraph.embeddingsSearch.EmbeddingsSearch.generateNodesRelevantForUser') {
				console.log('what are the dependencies');
				console.log(currentNode.dependencies);
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
		}
		return references;
	}
}

const parsePythonFilesForCodeSymbols = async (
	pythonServer: PythonServer,
	workingDirectory: string,
	filesToCheck: string[],
	emitter: EventEmitter,
): Promise<CodeSymbolInformation[]> => {
	const codeSymbolInformationList: CodeSymbolInformation[] = [];
	for (let index = 0; index < filesToCheck.length; index++) {
		const file = filesToCheck[index];
		if (!file.endsWith('.py')) {
			continue;
		}
		const code = await pythonServer.parseFile(file);
		console.log('We are over here in python parsing the files');
		console.log(code);
		emitter.emit('partialData', code);
		codeSymbolInformationList.push(...code);
	}
	return codeSymbolInformationList;
};


const parseGoFilesForCodeSymbols = async (
	goLangParser: GoLangParser,
	workingDirectory: string,
	filesToCheck: string[],
	emitter: EventEmitter,
): Promise<CodeSymbolInformation[]> => {
	const codeSymbolInformationList: CodeSymbolInformation[] = [];
	for (let index = 0; index < filesToCheck.length; index++) {
		const file = filesToCheck[index];
		if (!file.endsWith('.go')) {
			continue;
		}
		const code = await goLangParser.parseFileWithDependencies(file, true);
		emitter.emit('partialData', code);
		codeSymbolInformationList.push(...code);
	}
	return codeSymbolInformationList;
};

export const generateCodeGraph = async (
	projectManagement: TSMorphProjectManagement,
	pythonServer: PythonServer,
	goLangParser: GoLangParser,
	workingDirectory: string,
	emitter: EventEmitter,
): Promise<CodeGraph> => {
	const filesToTrack = await getFilesTrackedInWorkingDirectory(
		workingDirectory,
	);
	const finalNodeList: CodeSymbolInformation[] = [];
	projectManagement.directoryToProjectMapping.forEach(async (project, workingDirectory) => {
		const codeSymbolInformationList = await getCodeSymbolList(
			project,
			workingDirectory,
		);
		emitter.emit('partialData', codeSymbolInformationList);
		finalNodeList.push(...codeSymbolInformationList);
	});
	const pythonCodeSymbols = await parsePythonFilesForCodeSymbols(
		pythonServer,
		workingDirectory,
		filesToTrack,
		emitter,
	);
	finalNodeList.push(...pythonCodeSymbols);
	const goLangCodeSymbols = await parseGoFilesForCodeSymbols(
		goLangParser,
		workingDirectory,
		filesToTrack,
		emitter,
	);
	finalNodeList.push(...goLangCodeSymbols);
	return new CodeGraph(finalNodeList);
};
