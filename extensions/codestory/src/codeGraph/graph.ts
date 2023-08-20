/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We have to generate the graph of the codebase here, so we can query for nodes
import { getFilesTrackedInWorkingDirectory } from '../git/helper';
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

export const generateCodeGraph = async (
	projectManagement: TSMorphProjectManagement,
	pythonServer: PythonServer,
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
	return new CodeGraph(finalNodeList);
};
