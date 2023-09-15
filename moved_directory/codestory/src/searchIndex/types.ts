/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Progress } from 'vscode';
import { CodeSnippetInformation } from '../utilities/types';

export interface CodeSnippetSearchInformation {
	codeSnippetInformation: CodeSnippetInformation;
	score: number;
}

export enum CodeSearchIndexLoadStatus {
	NotPresent,
	Loaded,
	Failed,
}


// Some indexers might be file based, while others might be code symbol or snippet
// based, its important that we gather this information together so we can perform
// better code search
export enum CodeSearchIndexerType {
	FileBased,
	CodeSymbolBased,
	CodeSnippetBased,
}


export interface CodeSearchIndexLoadResult {
	status: CodeSearchIndexLoadStatus;
	filesMissing: string[];
}


// The base class we will be using for doing code search
export abstract class CodeSearchIndexer {
	abstract loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult>;

	abstract saveToStorage(): Promise<void>;

	abstract refreshIndex(): Promise<void>;

	abstract indexFile(filePath: string, workingDirectory: string): Promise<void>;

	abstract indexWorkspace(filesToIndex: string[], workingDirectory: string, progress: Progress<{
		message?: string | undefined;
		increment?: number | undefined;
	}>): Promise<void>;

	// We limit how many files we are going to get returned here by using
	// limit
	abstract search(query: string, limit: number, fileList: string[] | null): Promise<CodeSnippetSearchInformation[]>;

	abstract isReadyForUse(): Promise<boolean>;

	abstract markReadyToUse(): Promise<void>;

	abstract getIndexUserFriendlyName(): string;

	abstract getCodeSearchIndexerType(): CodeSearchIndexerType;

	abstract getIndexerAccuracy(): number;
}
