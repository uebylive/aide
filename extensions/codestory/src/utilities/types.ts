/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export enum CodeSymbolKind {
	file = 0,
	module = 1,
	namespace = 2,
	package = 3,
	class = 4,
	method = 5,
	property = 6,
	field = 7,
	constructor = 8,
	enum = 9,
	interface = 10,
	function = 11,
	variable = 12,
	constant = 13,
	string = 14,
	number = 15,
	boolean = 16,
	array = 17,
	object = 18,
	key = 19,
	null = 20,
	enumMember = 21,
	struct = 22,
	event = 23,
	operator = 24,
	typeParameter = 25
}

export interface CodeSymbolInformation {
	symbolName: string;
	symbolKind: CodeSymbolKind;
	symbolStartLine: number;
	symbolEndLine: number;
	codeSnippet:
	{ languageId: string; code: string };
	extraSymbolHint: string | null;
	dependencies: CodeSymbolDependencies[];
	fsFilePath: string;
	originalFilePath: string;
	workingDirectory: string;
	displayName: string;
	originalName: string;
	originalSymbolName: string;
	globalScope: string;
}

export interface FileCodeSymbolInformation {
	workingDirectory: string;
	filePath: string;
	codeSymbols: CodeSymbolInformation[];
}


export interface CodeSymbolDependencies {
	codeSymbolName: string;
	codeSymbolKind: CodeSymbolKind;
	// The edges here are to the code symbol node in our graph
	edges: CodeSymbolDependencyWithFileInformation[];
}

export interface CodeSymbolDependencyWithFileInformation {
	codeSymbolName: string;
	filePath: string;
}

export interface CodeSymbolInformationEmbeddings {
	codeSymbolInformation: CodeSymbolInformation;
	codeSymbolEmbedding: number[];
}
