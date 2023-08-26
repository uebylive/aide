/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// Now we will use tree-sitter to parse the code in a particular block to get
// the AST and figure out what symbols are relevant

import { exec } from 'child_process';
const Parser = require('web-tree-sitter');
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { CodeSymbolInformation } from './types';
import { Definition, LocationLink, Position, TextDocument, Uri, languages, workspace } from 'vscode';
import logger from '../logger';
import { getSymbolsFromDocumentUsingLSP } from './lspApi';

const TAB_LENGTH = 4;


// This is the tree sitter parser we are using for parsing
// the file system
let GO_PARSER: any | null = null;


const setGoParser = async () => {
	if (GO_PARSER) {
		return;
	}
	await Parser.init();
	const parser = new Parser();
	const filePath = path.join(__dirname, 'tree-sitter-go.wasm');
	const goLang = await Parser.Language.load(filePath);
	parser.setLanguage(goLang);
	GO_PARSER = parser;
};


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


const parseGoLangCodeUsingTreeSitter = (code: string): GoParserNodeInformation[] => {
	const parsedNode = GO_PARSER.parse(code);
	const rootNode = parsedNode.rootNode;
	const nodes: GoParserNodeInformation[] = [];
	const traverse = (node: any) => {
		if (node.type === 'identifier' || node.type === 'field_identifier') {
			nodes.push({
				type: node.type,
				startLine: node.startPosition.row,
				StartColumn: node.startPosition.column,
				endLine: node.endPosition.row,
				endColumn: node.endPosition.column,
				text: node.text,
			});
		}
		for (const child of node.children) {
			traverse(child);
		}
	};
	traverse(rootNode);
	return nodes;
}


// We are just parsing identifier and field identifier types here
export const parseGoCodeTreeSitter = async (code: string): Promise<GoParserNodeInformation[]> => {
	await setGoParser();
	const parsedNodes = parseGoLangCodeUsingTreeSitter(code);
	return parsedNodes.filter((node) => {
		return node.type === 'identifier' || node.type === 'field_identifier';
	});
};


export const getGoToDefinition = async (
	textDocument: TextDocument,
	lineNumber: number,
	columnNumber: number,
): Promise<Definition | LocationLink[]> => {
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
				logger.info('[getGoToDefinition] references');
				logger.info(definitions);
				return definitions;
			}
		} catch (e) {
			console.log('[getGoToDefinition] error');
			console.log(e);
		}
	}
	return [];
};


export const parseDependenciesForCodeSymbols = async (filePath: string, workingDirectory: string): Promise<CodeSymbolInformation[]> => {
	// First we load all the symbols which we know about and then try to parse
	// them internally
	logger.info('[CodeStory] Parsing dependencies for code symbols');
	const codeSymbolNodes = await getSymbolsFromDocumentUsingLSP(filePath, 'go', workingDirectory);
	const textDocument = await workspace.openTextDocument(Uri.file(filePath));
	// const codeSymbolNodes = JSON.parse(symbolOutput) as CodeSymbolInformation[];
	for (let index = 0; index < codeSymbolNodes.length; index++) {
		const currentCodeSymbol = codeSymbolNodes[index];
		console.log('[parseDependenciesForCodeSymbols]');
		console.log(currentCodeSymbol.codeSnippet.code);
		console.log(currentCodeSymbol.symbolStartLine, currentCodeSymbol.symbolEndLine);
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
				console.log('[goToDefinition] ', startLine - 1, startColumn - 1, dependency.text);
				const definition = await getGoToDefinition(textDocument, startLine, startColumn - 1);
				// console.log('[definition] ', startLine, definition);
			}
		}
	}
	return [];
};
