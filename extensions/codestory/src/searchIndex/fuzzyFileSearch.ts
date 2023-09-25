/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Progress } from 'vscode';
import { CodeSearchIndexLoadResult, CodeSearchIndexLoadStatus, CodeSearchIndexer, CodeSearchIndexerType, CodeSnippetSearchInformation } from './types';


// TODO(codestory): We want to implement fuzzy file path search
// we can do that by using the file search index present here and then querying
// using an LLM to see which file paths match up
export class FuzzyFilePathSearch extends CodeSearchIndexer {
	loadFromStorage(filesToTrack: string[]): Promise<CodeSearchIndexLoadResult> {
		throw new Error('Method not implemented.');
	}
	saveToStorage(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	refreshIndex(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	indexFile(filePath: string, workingDirectory: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	indexWorkspace(filesToIndex: string[], workingDirectory: string, progress: Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<void> {
		throw new Error('Method not implemented.');
	}
	search(query: string, limit: number, fileList: string[] | null): Promise<CodeSnippetSearchInformation[]> {
		throw new Error('Method not implemented.');
	}
	isReadyForUse(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	markReadyToUse(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getIndexUserFriendlyName(): string {
		throw new Error('Method not implemented.');
	}

	getCodeSearchIndexerType(): CodeSearchIndexerType {
		return CodeSearchIndexerType.FileBased;
	}

	getIndexerAccuracy(): number {
		// hand-waving the number here, not sure what the right value is
		return 0.4;
	}

}
