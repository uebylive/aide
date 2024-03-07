/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We want to keep track of the code symbols which have changed so we can provide
// an overview of what changes have been done up until now
// This will be useful in creating a better what was I doing feature
import { createPatch } from 'diff';
import * as events from 'events';
import { OpenAI } from 'openai';
import { Uri } from 'vscode';
import { Logger } from 'winston';

import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { CodeSymbolInformation, FileCodeSymbolInformation } from '../utilities/types';
import { Graph, GraphDFS, WCCFinder, topoSort } from './graphTopologicalSort';

export const getFileExtension = (filePath: string): string | undefined => {
	return filePath.split('.').pop();
};

export type CodeSymbolChangeType = 'added' | 'removed' | 'modified';

export type CodeSymbolChangeInFile = {
	fsPath: string;
	codeSymbolsWhichChanged: CodeSymbolChange[];
};

// We are going to store if the code symbol was added modified or removed from
// our workspace
export interface CodeSymbolChange {
	name: string;
	codeSymbol: CodeSymbolInformation;
	changeType: CodeSymbolChangeType;
	changeTime: Date;
	diffPatch: string;
	componentIdentifier: string;
	commitIdentifier: string;
}

interface FileSaveCodeSymbolInformation {
	codeSymbols: CodeSymbolInformation[];
	timestamp: number;
}

const checkIfFileSaveCodeSymbolInformationIsStale = (
	fileSaveInfo: FileSaveCodeSymbolInformation,
	instant: number
): boolean => {
	if (instant > 2000.0 + fileSaveInfo.timestamp) {
		return true;
	} else {
		return false;
	}
};

export class TrackCodeSymbolChanges {
	private _codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection;
	private codeSymbolsWhichChanged: Map<Uri, CodeSymbolChange[]>;
	// This is used to track when the file has been opened
	private fileOpenedCodeSymbolTracked: Map<string, FileCodeSymbolInformation>;
	// This is used to track when the file was saved
	private fileSavedCodeSymbolTracked: Map<string, FileSaveCodeSymbolInformation>;
	// This is used to track when the file was edited
	private fileOnSaveLastParsedTimestamp: Map<string, number>;
	private logger: Logger;
	private workingDirectory: string;
	public statusUpdated: boolean;

	constructor(
		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
		workingDirectory: string,
		logger: Logger,
	) {
		this._codeSymbolsLanguageCollection = codeSymbolsLanguageCollection;
		this.codeSymbolsWhichChanged = new Map<Uri, CodeSymbolChange[]>();
		this.workingDirectory = workingDirectory;
		this.fileOpenedCodeSymbolTracked = new Map<string, FileCodeSymbolInformation>();
		this.fileOnSaveLastParsedTimestamp = new Map<string, number>();
		this.fileSavedCodeSymbolTracked = new Map<string, FileSaveCodeSymbolInformation>();
		this.logger = logger;
		this.statusUpdated = false;
	}

	public async setFileOpenedCodeSymbolTracked(
		filePath: string,
		codeSymbolInformationList: CodeSymbolInformation[],
	) {
		console.log(codeSymbolInformationList);
		this.logger.info('How many symbols have changed: ' + codeSymbolInformationList.length + ' ' + filePath);
		this.fileOpenedCodeSymbolTracked.set(filePath, {
			codeSymbols: codeSymbolInformationList,
			workingDirectory: this.workingDirectory,
			filePath: filePath,
		});
		// Now pretend to save the file so we load all the changes
		await this.fileSaved(Uri.file(filePath), this.logger);
	}

	public async filesChangedSinceLastCommit(
		filePath: string,
		fileContentSinceHead: string,
		emitter: events.EventEmitter,
	) {
		// Now we try to get the extension of the file and see where it belongs
		// to
		const indexer = this._codeSymbolsLanguageCollection.getIndexerForFile(filePath);
		if (indexer === undefined) {
			return [];
		} else {
			const codeSymbols = await indexer.parseFileWithContent(
				filePath,
				fileContentSinceHead,
			);
			emitter.emit('fileChanged', {
				filePath: filePath,
				codeSymbols: codeSymbols,
			});
			return codeSymbols;
		}
	}

	private checkIfFileSaveCodeSymbolInformationIsStale(filePath: string): boolean {
		const previousSavedInformation = this.fileSavedCodeSymbolTracked.get(filePath);
		if (previousSavedInformation === undefined) {
			return true;
		}
		return checkIfFileSaveCodeSymbolInformationIsStale(previousSavedInformation, Date.now());
	}

	private async getCodeSymbolInformationFromFilePath(
		filePath: string,
		// This config is important if we want to force the fetch to happen
		shouldAnywaysFetch: boolean = false
	): Promise<CodeSymbolInformation[]> {
		if (filePath.endsWith('.git')) {
			filePath = filePath.slice(0, -'.git'.length);
		}
		const fileExtension = getFileExtension(filePath);
		if (fileExtension === undefined) {
			return [];
		}
		if (!shouldAnywaysFetch && !this.checkIfFileSaveCodeSymbolInformationIsStale(filePath)) {
			const alreadyTrackedCodeSymbols = this.fileSavedCodeSymbolTracked.get(filePath)?.codeSymbols;
			this.logger.info(
				`[track-code-symbols] We have already tracker: ${alreadyTrackedCodeSymbols}`
			);
			return alreadyTrackedCodeSymbols ?? [];
		}
		this.logger.info(`[track-code-symbols][global] We are going to track ${filePath}`);
		const indexer = this._codeSymbolsLanguageCollection.getCodeIndexerForType(fileExtension);
		if (indexer === undefined) {
			return [];
		} else {
			const codeSymbols = await indexer.parseFileWithDependencies(
				filePath,
				this.workingDirectory,
				false,
			);
			this.logger.info(`[track-code-symbols] we have some symbols here ${codeSymbols.length}`);
			this.fileSavedCodeSymbolTracked.set(filePath, {
				codeSymbols: codeSymbols,
				timestamp: Date.now(),
			});
			return codeSymbols;
		}
	}

	public async fileOpened(uri: Uri) {
		// We opened the file, so check the code symbols here and keep track
		// of them if we are not already doing that
		let fileCodeSymbolInformation = this.fileOpenedCodeSymbolTracked.get(uri.fsPath);
		if (fileCodeSymbolInformation !== undefined) {
			return;
		}
		const codeSymbolInformation = await this.getCodeSymbolInformationFromFilePath(uri.fsPath, true);
		fileCodeSymbolInformation = {
			workingDirectory: this.workingDirectory,
			filePath: uri.fsPath,
			codeSymbols: codeSymbolInformation,
		};
		this.fileOpenedCodeSymbolTracked.set(uri.fsPath, fileCodeSymbolInformation);
	}

	private async parseFileCodeSymbolDiff(
		fsPath: string,
		previousCodeSymbolsInFileMap: Map<string, CodeSymbolInformation>
	) {
		// Lets grab what code symbols we had when the file was opened for the
		// first time
		const codeSymbolsInFile = await this.getCodeSymbolInformationFromFilePath(fsPath);
		this.logger.info(
			`[changes] We have ${codeSymbolsInFile.length} code symbols in file ${fsPath}`
		);
		const newCodeSymbolsInFileMap = new Map<string, CodeSymbolInformation>();
		for (const codeSymbol of codeSymbolsInFile) {
			newCodeSymbolsInFileMap.set(codeSymbol.symbolName, codeSymbol);
		}
		// Now we compare the two maps to see what code symbols have changed
		const codeSymbolsWhichChanged: CodeSymbolChange[] = [];
		for (const [codeSymbolName, codeSymbol] of newCodeSymbolsInFileMap) {
			const previousCodeSymbol = previousCodeSymbolsInFileMap.get(codeSymbolName);
			if (previousCodeSymbol === undefined) {
				// This means the code symbol was added
				codeSymbolsWhichChanged.push({
					name: codeSymbolName,
					codeSymbol: codeSymbol,
					changeType: 'added',
					changeTime: new Date(),
					componentIdentifier: 'not_tracked',
					commitIdentifier: 'not_tracked',
					diffPatch: codeSymbol.codeSnippet.code,
				});
			} else {
				// We need to check if the code symbol was modified
				this.logger.info(
					`[changes] Code Symbol ${codeSymbolName} was modified ${previousCodeSymbol.codeSnippet.code} ${codeSymbol.codeSnippet.code}`
				);
				if (previousCodeSymbol.codeSnippet.code !== codeSymbol.codeSnippet.code) {
					codeSymbolsWhichChanged.push({
						name: codeSymbolName,
						codeSymbol: codeSymbol,
						changeType: 'modified',
						changeTime: new Date(),
						componentIdentifier: 'not_tracked',
						commitIdentifier: 'not_tracked',
						diffPatch: createPatch(
							codeSymbolName,
							previousCodeSymbol.codeSnippet.code,
							codeSymbol.codeSnippet.code
						),
					});
				}
			}
		}

		// We need to check if the code symbol was removed
		for (const [codeSymbolName, codeSymbol] of previousCodeSymbolsInFileMap) {
			const newCodeSymbol = newCodeSymbolsInFileMap.get(codeSymbolName);
			if (newCodeSymbol === undefined) {
				codeSymbolsWhichChanged.push({
					name: codeSymbolName,
					codeSymbol: codeSymbol,
					changeType: 'removed',
					changeTime: new Date(),
					componentIdentifier: 'not_tracked',
					commitIdentifier: 'not_tracked',
					diffPatch: '',
				});
			}
		}
		this.logger.info(
			`[changes] We have ${codeSymbolsWhichChanged.length} code symbols which changed`
		);
		return codeSymbolsWhichChanged;
	}

	public async fileSaved(uri: Uri, logger: Logger) {
		if (!this.statusUpdated) {
			console.log('[fileSaved] status not updated yet');
			return;
		}
		const lastParsedFileTimestamp = this.fileOnSaveLastParsedTimestamp.get(uri.fsPath);
		if (lastParsedFileTimestamp === undefined) {
			this.fileOnSaveLastParsedTimestamp.set(uri.fsPath, Date.now());
		} else {
			// We only parse the files every 2 seconds, thats a good hand
			// measure of how often people save files
			if (lastParsedFileTimestamp + 2000 > Date.now()) {
				// This means we parsed the file very recently, so we don't
				// need to do it again
				return;
			}
		}

		// Now we see what symbols were there on the file when we opened it
		const fileInformationWhenFileWhenOpen = this.fileOpenedCodeSymbolTracked.get(uri.fsPath);
		const codeSymbolsWhenFileOpen = fileInformationWhenFileWhenOpen?.codeSymbols ?? [];
		const previousCodeSymbolsInFileMap = new Map<string, CodeSymbolInformation>();
		for (const codeSymbol of codeSymbolsWhenFileOpen) {
			previousCodeSymbolsInFileMap.set(codeSymbol.symbolName, codeSymbol);
		}
		const codeSymbolsWhichChanged = await this.parseFileCodeSymbolDiff(
			uri.fsPath,
			previousCodeSymbolsInFileMap
		);
		this.codeSymbolsWhichChanged.set(uri, codeSymbolsWhichChanged);

		// Update the last saved timestamp of the file
		this.fileOnSaveLastParsedTimestamp.set(uri.fsPath, Date.now());
		logger.info(
			`[fileSaved][changes] File ${uri.fsPath} was saved and we found ${codeSymbolsWhichChanged.length} code symbols which changed`
		);
	}

	public getChangedCodeSymbols(): {
		fsPath: string;
		codeSymbolsWhichChanged: CodeSymbolChange[];
	}[] {
		console.log('something');
		const results: CodeSymbolChangeInFile[] = [];
		for (const [uriFilePath, value] of this.codeSymbolsWhichChanged.entries()) {
			const codeSymbolsWhichChanged: CodeSymbolChange[] = [];
			for (const codeSymbolWhichChanged of value) {
				this.logger.info(
					`[changes] Code Symbol ${codeSymbolWhichChanged.name} changed with status ${codeSymbolWhichChanged.changeType} dependencies: ${codeSymbolWhichChanged.codeSymbol.dependencies.length}`
				);
				codeSymbolsWhichChanged.push(codeSymbolWhichChanged);
			}
			results.push({
				fsPath: uriFilePath.fsPath,
				codeSymbolsWhichChanged: codeSymbolsWhichChanged,
			});
		}
		return results;
	}

	private async updateCodeSymbolsWhichChanged(changes: CodeSymbolChangeInFile[]): Promise<{
		changes: CodeSymbolChangeInFile[];
		codeSymbolNameToCodeSymbolChange: Map<string, CodeSymbolChange>;
	}> {
		const codeSymbolNameToCodeSymbolChange: Map<string, CodeSymbolChange> = new Map();
		// Since the order in which code can be written is different for each
		// user, we need to parse the file again at this point to make things
		// work
		for (const change of changes) {
			const previousCodeSymbolsInFileMap = new Map<string, CodeSymbolInformation>();
			const previousCodeSymbolsInFile = this.fileOpenedCodeSymbolTracked.get(change.fsPath);
			if (previousCodeSymbolsInFile === undefined) {
				// TODO(skcd): This probably means that we have created a new file
				// and just saved things there.. maybe?
				this.logger.info(
					`[changes] File ${change.fsPath} was saved but we don't have any code symbols for it`
				);
				continue;
			}
			for (const codeSymbol of previousCodeSymbolsInFile.codeSymbols) {
				previousCodeSymbolsInFileMap.set(codeSymbol.symbolName, codeSymbol);
			}
			const codeSymbolInformation = await this.getCodeSymbolInformationFromFilePath(change.fsPath);
			const codeSymbolInformationMap = new Map<string, CodeSymbolInformation>();
			for (const codeSymbol of codeSymbolInformation) {
				codeSymbolInformationMap.set(codeSymbol.symbolName, codeSymbol);
			}
			const codeSymbolsWhichChanged: CodeSymbolChange[] = [];
			for (const codeSymbolWhichChanged of change.codeSymbolsWhichChanged) {
				const codeSymbol = codeSymbolInformationMap.get(codeSymbolWhichChanged.name);
				if (codeSymbol === undefined) {
					continue;
				}
				codeSymbolsWhichChanged.push({
					name: codeSymbolWhichChanged.name,
					codeSymbol: codeSymbol,
					changeType: codeSymbolWhichChanged.changeType,
					changeTime: codeSymbolWhichChanged.changeTime,
					componentIdentifier: codeSymbolWhichChanged.componentIdentifier,
					commitIdentifier: codeSymbolWhichChanged.commitIdentifier,
					diffPatch: codeSymbolWhichChanged.diffPatch,
				});
			}
			codeSymbolsWhichChanged.forEach((codeSymbolWhichChanged) => {
				codeSymbolNameToCodeSymbolChange.set(codeSymbolWhichChanged.name, codeSymbolWhichChanged);
			});
			change.codeSymbolsWhichChanged = codeSymbolsWhichChanged;
		}

		return {
			changes,
			codeSymbolNameToCodeSymbolChange,
		};
	}

	public async getTreeListOfChangesWeHaveToCommit(
		changes: CodeSymbolChangeInFile[]
	): Promise<CodeSymbolChange[]> {
		// First we get all the nodes which have changed
		const edges: Map<string, string[]> = new Map();
		const changedNodes: Set<string> = new Set();
		this.logger.info(`[changes][dfstree] We have ${changes.length} files which have changed`);

		// Since the order in which code can be written is different for each
		// user, we need to parse the file again at this point to make things
		// work
		const freshChanges = await this.updateCodeSymbolsWhichChanged(changes);
		changes = freshChanges.changes;
		const codeSymbolNameToCodeSymbolChange = freshChanges.codeSymbolNameToCodeSymbolChange;

		// Get all the nodes which have changed
		changes.forEach((changedCodeSymbol) => {
			changedCodeSymbol.codeSymbolsWhichChanged.forEach((codeSymbolsWhichChanged) => {
				changedNodes.add(codeSymbolsWhichChanged.name);
			});
		});
		changes.forEach((changedCodeSymbol) => {
			changedCodeSymbol.codeSymbolsWhichChanged.forEach((codeSymbolsWhichChanged) => {
				const changedState = codeSymbolsWhichChanged.changeType;
				const dependencies = codeSymbolsWhichChanged.codeSymbol.dependencies;
				this.logger.info(
					`[changes] Code Symbol ${codeSymbolsWhichChanged.name} has ${JSON.stringify(
						dependencies
					)} dependencies and is in state ${changedState}`
				);
			});
		});

		this.logger.info(
			`[changes][dfstree] We have ${changedNodes.size} nodes which have changed ${[
				...changedNodes,
			]}`
		);

		for (const changedCodeSymbol of changes) {
			changedCodeSymbol.codeSymbolsWhichChanged.forEach((codeSymbolsWhichChanged) => {
				const changedState = codeSymbolsWhichChanged.changeType;
				this.logger.info(
					`[changes][dfs-tree] Whats the code symbol which we are changing ${codeSymbolsWhichChanged.name} in state ${changedState}`
				);
				const dependencies = codeSymbolsWhichChanged.codeSymbol.dependencies;
				dependencies.forEach((dependency) => {
					dependency.edges.forEach((dependentEdge) => {
						this.logger.info(
							`[changes] Code Symbol ${codeSymbolsWhichChanged.name
							} is in state ${changedState} and has dependent edge ${dependentEdge.codeSymbolName
							} and is it present ${changedNodes.has(dependentEdge.codeSymbolName)}`
						);
						// This means that the dependency has changed, so we need
						// to add an edge, but it should also be present in the
						// changed nodes
						if (changedNodes.has(dependentEdge.codeSymbolName)) {
							// This means the dependency has changed, so we add
							// an edge here to keep track of the current node
							// and the dependency
							const edgesForNode = edges.get(dependentEdge.codeSymbolName);
							if (edgesForNode === undefined) {
								edges.set(dependentEdge.codeSymbolName, [codeSymbolsWhichChanged.name]);
							} else {
								edgesForNode.push(codeSymbolsWhichChanged.name);
								edges.set(dependentEdge.codeSymbolName, edgesForNode);
							}
						}
					});
				});
			});
		}

		this.logger.info(`[changes][dfstree] We have ${edges.size} edges`);

		const finalChangedNodes: CodeSymbolChange[] = [];

		// This is where we traverse the graph to get the weakly connected
		// components
		const graph = new Graph();
		changedNodes.forEach((node) => {
			graph.addNode(node);
		});
		for (const [node, nodeEdges] of edges.entries()) {
			nodeEdges.forEach((possibleEdge) => {
				graph.addEdge(node, possibleEdge);
				this.logger.info(`[changes][dfstree] Adding edge ${node} ${possibleEdge}`);
			});
		}

		const weaklyConnectedComponents = new WCCFinder(graph).wccs;
		weaklyConnectedComponents.forEach((component, i) => {
			const componentGraph: Record<string, string[]> = {};

			for (const node of component) {
				componentGraph[node] = graph.adjacencyList[node].filter((neighbor) =>
					component.includes(neighbor)
				);
			}

			const sortedNodes = topoSort(componentGraph);
			sortedNodes.forEach((symbolName) => {
				const codeSymbolChange = codeSymbolNameToCodeSymbolChange.get(symbolName);
				if (codeSymbolChange === undefined) {
					return;
				}
				codeSymbolChange.componentIdentifier = `component_${i + 1}`;
				this.logger.info(
					`[changes][dfstree] Code Symbol ${codeSymbolChange.name} is in component ${i + 1}`
				);
				finalChangedNodes.push(codeSymbolChange);
			});
		});
		this.logger.info(
			`[changes][dfstree] We have the following connected components ${JSON.stringify(
				finalChangedNodes
			)}`
		);

		// Now we try to get the file level plan cause thats what we are working
		// with right now
		const fileLevelPlan = await this.getFileLevelCommitPlan(changes);
		const fileToIndex: Map<string, number> = new Map();
		fileLevelPlan.forEach((files, index) => {
			files.forEach((file) => {
				fileToIndex.set(file, index);
			});
		});
		finalChangedNodes.forEach((codeSymbolChange) => {
			const fsPath = codeSymbolChange.codeSymbol.fsFilePath;
			const index = fileToIndex.get(fsPath);
			if (index === undefined) {
				return;
			}
			codeSymbolChange.commitIdentifier = `commit_${index + 1}`;
		});
		// Now we update our changed nodes to supply this information too
		return finalChangedNodes;
	}

	public async getFileLevelCommitPlan(
		changedSymbols: CodeSymbolChangeInFile[]
		// [[file_1, file_2], [file_3]]
	): Promise<string[][]> {
		const changedNodes: Set<string> = new Set();
		const codeSymbolToFile: Map<string, string> = new Map();
		// Get the files which the symbols belong to and change them accordingly
		const freshChanges = await this.updateCodeSymbolsWhichChanged(changedSymbols);
		const changes = freshChanges.changes;
		// Get all the nodes which have changed
		changes.forEach((changedCodeSymbol) => {
			changedCodeSymbol.codeSymbolsWhichChanged.forEach((codeSymbolsWhichChanged) => {
				changedNodes.add(codeSymbolsWhichChanged.name);
				codeSymbolToFile.set(codeSymbolsWhichChanged.name, changedCodeSymbol.fsPath);
			});
		});
		// First we get all the nodes which have changed
		const fileEdges: Map<string, string[]> = new Map();
		for (const changedCodeSymbol of changes) {
			changedCodeSymbol.codeSymbolsWhichChanged.forEach((codeSymbolsWhichChanged) => {
				const changedState = codeSymbolsWhichChanged.changeType;
				const dependencies = codeSymbolsWhichChanged.codeSymbol.dependencies;
				dependencies.forEach((dependency) => {
					dependency.edges.forEach((dependentEdge) => {
						this.logger.info(
							`[changes] Code Symbol ${codeSymbolsWhichChanged.name
							} is in state ${changedState} and has dependent edge ${dependentEdge.codeSymbolName
							} and is it present ${changedNodes.has(dependentEdge.codeSymbolName)}`
						);
						// This means that the dependency has changed, so we need
						// to add an edge, but it should also be present in the
						// changed nodes
						const filePathForDependentSymbol = codeSymbolToFile.get(dependentEdge.codeSymbolName);
						if (
							changedNodes.has(dependentEdge.codeSymbolName) &&
							filePathForDependentSymbol !== undefined
						) {
							// This means the dependency has changed, so we add
							// an edge here to keep track of the current node
							// and the dependency
							const edgesForNode = fileEdges.get(filePathForDependentSymbol);
							const codeSymbolFilePath = codeSymbolsWhichChanged.codeSymbol.fsFilePath;
							if (edgesForNode === undefined) {
								fileEdges.set(filePathForDependentSymbol, [codeSymbolFilePath]);
							} else {
								edgesForNode.push(codeSymbolFilePath);
								fileEdges.set(filePathForDependentSymbol, edgesForNode);
							}
						}
					});
				});
			});
		}

		// This is where we traverse the graph to get the weakly connected
		// components
		const graph = new GraphDFS([]);
		fileEdges.forEach((edges, node) => {
			graph.addNode(node);
			edges.forEach((edge) => {
				graph.addNode(edge);
			});
		});
		fileEdges.forEach((edges, node) => {
			edges.forEach((edge) => {
				graph.addEdge(node, edge);
			});
		});

		const filesToCommitTogether = graph.connectedComponents();

		return filesToCommitTogether;
	}
}

export const getCodeSymbolsChangedInSameBlockDescription = (
	codeSymbolChanges: {
		name: string;
		diffPatch: string;
		lastEditTime: number;
		languageId: string;
	}[]
): OpenAI.Chat.CreateChatCompletionRequestMessage[] => [
		{
			role: 'system',
			content: `
				You are a senior engineer helping another engineer write good commit messages for the set of related changes they are doing. You have to answer in 2-3 sentence description of the 'how' of the change. It should also answer the question: 'What was I doing?' which means the user will look at this to quickly understand the changes they have done in these related code symbol changes.
				Since the changes are linked together, you will be given the list of related changes and they are related almost always because they one of the code symbols uses the other one which was changed.

				You have to generate the description of what has changed so the user can jump back to work after simply reading it.

				When describing the change happening to the code symbols which are related, dont talk about which code symbols were changed, try to write like a human what the change was about,

				for example if I am passing a new variable you can write: we are passing a new variable from function A to function B ... etc
				Always mention code symbols in markdown so they can rendered properly, you are also given the language in which the change was made, use that to figure out if there are common traits of the changes.. like
				- passing a variable through a repeated function call
				- reason with all the changes present in the timewise order, so you can use that to create an easy to see overview of the changes
				I want you to output the final answer in a JSON properly formatted as:
				\`\`\`
				{
					"changes": [
						"First change",
						"Second change",
						"Third change",
						....
					],
					"summary": "This is a summary of the changes"
				}
				\`\`\`
				when talking about the change only mention the what of the change in the codeblocks combined together. Be concise in your answer and dont try to fill in the list of changes if you can describe it in a concise way.
				The summary has to be less than 72 characters.
				ONLY REPLY WITH THE JSON OBJECT AND NOTHING ELSE`,
		},
		{
			role: 'user',
			content: `
				The changed made were in the following code symbols:
				You are given a json like structure with the fields name (name of the code symbol which changed)
				diffPatch: The changes made in the code symbol in a diff view
				lastEditTime: The last time the code symbol was edited

				${JSON.stringify(codeSymbolChanges)}
			`,
		},
	];
