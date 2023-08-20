/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Definition, LocationLink, Position, TextDocument, languages, workspace, Location } from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { getSymbolsFromDocumentUsingLSP } from '../utilities/lspApi';
import { CodeSymbolInformation } from '../utilities/types';
import { promisify } from 'util';
import { exec } from 'child_process';
import logger from '../logger';


const TAB_LENGTH = 4;

export interface GoParserNodeInformation {
	'type': string;
	'startLine': number;
	'StartColumn': number;
	'endLine': number;
	'endColumn': number;
	'text': string[];
}

const countTabLength = (line: string[]): number => {
	if (line.length === 0) {
		return 0;
	}
	const match = line[0].match(/^(\t*)/);
	return match ? match[0].length : 0;
};

async function runCommand(cmd: string): Promise<[string, string | undefined]> {
	let stdout = '';
	let stderr = '';
	try {
		const output = await promisify(exec)(cmd, {
			shell: process.platform === 'win32' ? 'powershell.exe' : undefined,
		});
		stdout = output.stdout;
		stderr = output.stderr;
	} catch (e: any) {
		stderr = e.stderr;
		stdout = e.stdout;
	}

	const stderrOrUndefined = stderr === '' ? undefined : stderr;
	return [stdout, stderrOrUndefined];
}


// We are just parsing identifier and field identifier types here
export const parseGoCodeTreeSitter = async (code: string): Promise<GoParserNodeInformation[]> => {
	// First we need write this to a file
	// Second we pass that file location as argument to the python script
	// Third we read the stdout of the python script and parse it to get the final
	// results, which will look somewhat like this
	const codePath = `/tmp/codestory/${uuidv4()}`;
	const outputPath = `/tmp/codestory/${uuidv4()}`;
	fs.writeFileSync(codePath, code);
	// Now we will exec the python script here
	// TODO(codestory): Fix this here and remove dependency from local host here
	const _ = await runCommand(`/opt/miniconda3/bin/python3 /Users/skcd/scratch/anton/anton/tooling/tree_sitter_parsing.py ${codePath} ${outputPath}`);
	// Now we will read from the output file and parse it back to the type frontend needs
	const outputString = fs.readFileSync(outputPath, 'utf8');
	const outputJSON = JSON.parse(outputString);
	// We are going to parse out only those which are identifier or filed identifier types here
	// and pray to the gods that we can create a graph hopefully
	const possibleNodes = outputJSON as GoParserNodeInformation[];
	return possibleNodes.filter((node) => {
		return node.type === 'identifier' || node.type === 'field_identifier';
	});
};


export const definitionInformation = (
	definition: Definition | LocationLink[],
): {
	fsFilePath: string;
	startPosition: Position;
} | null => {
	if (Array.isArray(definition)) {
		// This can be either of type LocationLink or Location[], so we need
		// to check what type it is and infer that here
		if (definition.length === 0) {
			return null;
		}
		// We pick up the first location always, we should probably figure out
		// the correct thing to do here later on
		if ('originSelectionRange' in definition[0]) {
			const locationLinks = definition as LocationLink[];
			for (let index = 0; index < locationLinks.length; index++) {
				const locationLink = locationLinks[index];
				const filePath = locationLink.targetUri.fsPath;
				const lineNumber = locationLink.targetRange.start;
				return {
					fsFilePath: filePath,
					startPosition: lineNumber,
				};
			}
		} else {
			// This is of type Location[]
			const locations = definition as Location[];
			for (let index = 0; index < locations.length; index++) {
				const location = locations[index];
				const filePath = location.uri.fsPath;
				const lineNumber = location.range.start;
				return {
					fsFilePath: filePath,
					startPosition: lineNumber,
				};
			}
		}
	} else {
		return {
			fsFilePath: definition.uri.fsPath,
			startPosition: definition.range.start,
		};
	}
	return null;
};


export const getGoToDefinition = async (
	textDocument: TextDocument,
	lineNumber: number,
	columnNumber: number,
): Promise<{
	fsFilePath: string;
	startPosition: Position;
} | null> => {
	const referencesProviders = languages.getDefinitionProvider({
		language: 'typescript',
		scheme: 'file',
	});
	for (let index = 0; index < referencesProviders.length; index++) {
		try {
			const definitions = await referencesProviders[index].provideDefinition(
				textDocument,
				new Position(lineNumber, columnNumber),
				{
					isCancellationRequested: false,
					onCancellationRequested: () => ({ dispose() { } }),
				}
			);
			if (definitions) {
				return definitionInformation(definitions);
			}
		} catch (e) {
			logger.error(e);
		}
	}
	return null;
};



export class GoLangParser {
	private _workingDirectory: string;
	private _fileToCodeSymbols: Map<string, CodeSymbolInformation[]> = new Map();

	constructor(workingDirectory: string) {
		this._workingDirectory = workingDirectory;
	}

	// This parses the file without resolving the dependencies
	async parseFileWithoutDependency(filePath: string): Promise<CodeSymbolInformation[]> {
		const codeSymbols = await getSymbolsFromDocumentUsingLSP(
			filePath,
			'go',
			this._workingDirectory,
		);
		this._fileToCodeSymbols.set(filePath, codeSymbols);
		return codeSymbols;
	}

	getSymbolAtLineNumber(filePath: string, lineNumber: number): CodeSymbolInformation | null {
		const codeSymbols = this._fileToCodeSymbols.get(filePath);
		if (!codeSymbols) {
			return null;
		}
		for (let index = 0; index < codeSymbols.length; index++) {
			const codeSymbol = codeSymbols[index];
			if (codeSymbol.symbolStartLine <= lineNumber && codeSymbol.symbolEndLine >= lineNumber) {
				return codeSymbol;
			}
		}
		return null;
	}

	async fixDependenciesForCodeSymbols(filePath: string): Promise<void> {
		const textDocument = await workspace.openTextDocument(filePath);
		const codeSymbolNodes = this._fileToCodeSymbols.get(filePath) ?? [];
		const newCodeSymbols = [];
		for (let index = 0; index < codeSymbolNodes.length; index++) {
			const currentCodeSymbol = codeSymbolNodes[index];
			const startLineCodeSymbolStart = currentCodeSymbol.symbolStartLine;
			const endLineCodeSymbolStart = currentCodeSymbol.symbolEndLine;
			const codeSnippet = currentCodeSymbol.codeSnippet.code;
			const dependentNodes = await parseGoCodeTreeSitter(codeSnippet);
			// Lets fix the position here by first counting the number of tabs at
			// the start of the sentence
			for (let dependencyIndex = 0; dependencyIndex < dependentNodes.length; dependencyIndex++) {
				const dependency = dependentNodes[dependencyIndex];
				if (dependency.text) {
					const tabCount = countTabLength(dependency.text);
					const startLine = currentCodeSymbol.symbolStartLine + dependency.startLine;
					// maths here is hard but if there are tabs then we are going to subtract the tabs at the start
					const startColumn = dependency.StartColumn + tabCount * TAB_LENGTH - tabCount + 1;
					const endColumn = dependency.endColumn + tabCount * TAB_LENGTH - tabCount + 1;
					// Go to definition now
					const definition = await getGoToDefinition(textDocument, startLine - 1, startColumn - 1);
					let codeSymbolForDefinition = null;
					if (definition === null) {
						continue;
					}
					if (definition.fsFilePath === filePath) {
						if (definition.startPosition.line >= startLineCodeSymbolStart && definition.startPosition.line <= endLineCodeSymbolStart) {
							// We are in the same function block, so no need to regard this as a dependency
						} else {
							// Find the symbol in the filePath whose line start matches up
							codeSymbolForDefinition = this.getSymbolAtLineNumber(
								definition.fsFilePath,
								definition.startPosition.line,
							);
						}
					} else {
						codeSymbolForDefinition = this.getSymbolAtLineNumber(
							definition.fsFilePath,
							definition.startPosition.line,
						);
					}
					if (codeSymbolForDefinition) {
						currentCodeSymbol.dependencies.push({
							codeSymbolName: codeSymbolForDefinition.symbolName,
							codeSymbolKind: codeSymbolForDefinition.symbolKind,
							edges: [{
								filePath: definition.fsFilePath,
								codeSymbolName: codeSymbolForDefinition.symbolName,
							}],
						});
					}
				}
			}
			newCodeSymbols.push(currentCodeSymbol);
		}
		this._fileToCodeSymbols.set(filePath, newCodeSymbols);
	}

	// This parses the file and also resolves the dependencies
	// Ideally we will be passing the file -> Vec<CodeSymbolInformation> here
	// but right now we use the instance from the class internally
	async parseFileWithDependencies(filePath: string): Promise<CodeSymbolInformation[]> {
		await this.fixDependenciesForCodeSymbols(filePath);
		return this._fileToCodeSymbols.get(filePath) ?? [];
	}
}
