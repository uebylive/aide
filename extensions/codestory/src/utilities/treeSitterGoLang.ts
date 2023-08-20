/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// Now we will use tree-sitter to parse the code in a particular block to get
// the AST and figure out what symbols are relevant

import { exec } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { CodeSymbolInformation } from './types';
import { Definition, LocationLink, Position, TextDocument, Uri, languages, workspace } from 'vscode';
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
	const symbolLocation = '/tmp/documentSymbolsSomething';
	const symbolOutput = fs.readFileSync(symbolLocation, 'utf8');
	const uri = Uri.file(filePath);
	const textDocument = await workspace.openTextDocument(uri);
	logger.info('[parseDependenciesForCodeSymbols] textDocument opened');
	const codeSymbolNodes = JSON.parse(symbolOutput) as CodeSymbolInformation[];
	for (let index = 0; index < codeSymbolNodes.length; index++) {
		const currentCodeSymbol = codeSymbolNodes[index];
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
			}
		}
	}
	return [];
};


// void (async () => {
// 	const code = `
// 	func (h *HeartBeat) Start(ctx context.Context) {
// 		if h.TickInterval <= 0 {
// 			log.Ctx(ctx).Info().Msg("Heartbeat has been disabled")
// 			return
// 		}

// 		ticker := time.NewTicker(time.Duration(h.TickInterval) * time.Second)
// 		go func() {
// 			for {
// 				select {
// 				case <-ctx.Done():
// 					log.Ctx(ctx).Info().Msg("Shutting down heartbeat")
// 					return
// 				case <-ticker.C:
// 					log.Ctx(ctx).Info().Msg("Sending heartbeat to NPCI")
// 					h.sendHeartBeat(ctx)
// 				}
// 			}
// 		}()
// 	}
// 	`;
// 	const parsedOutput = await parseGoCodeTreeSitter(code);
// 	console.log(parsedOutput);
// 	const codeSymbols = parseDependenciesForCodeSymbols(
// 		'/Users/skcd/Downloads/mugavari-main/internal/pkg/health/heartbeat.go',
// 		'Users/skcd/Downloads/mugavari-main/',
// 	);
// })();
