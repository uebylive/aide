/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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


export interface CodeSearchIndexLoadResult {
	status: CodeSearchIndexLoadStatus;
	filesMissing: string[];
}


// The base class we will be using for doing code search
export abstract class CodeSearchIndexer {
	abstract loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult>;

	abstract saveToStorage(): Promise<void>;

	abstract refreshIndex(): Promise<void>;

	abstract indexFile(filePath: string): Promise<void>;

	abstract indexWorkspace(filesToIndex: string[]): Promise<void>;

	// We limit how many files we are going to get returned here by using
	// limit
	abstract search(query: string, limit: number): Promise<CodeSnippetSearchInformation[]>;

	abstract isReadyForUse(): Promise<boolean>;
}
