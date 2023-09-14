/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type PageType = 'home' | 'search' | 'commit';

export type CodeSymbolChange = {
	name: string;
	startLine: number;
	endLine: number;
	changeType: 'added' | 'removed' | 'modified';
	filePath: string;
	workingDirectory: string;
	changeTime: Date;
	relativePath: string;
	componentIdentifier: string;
	commitIdentifier: string;
	displayName: string;
	diffPatch: string;
};

export type ChangeDescription = {
	summary: string;
	changes: string[];
};

export type CodeBlockChangeDescription = {
	componentIdentifier: string;
	changeDescription: ChangeDescription;
};

export type CodeBlockChangeDescriptionResponse = {
	codeBlockChangeDescriptions: CodeBlockChangeDescription[];
	setCodeBlockChangeDescriptions: (
		newCodeBlockChangeDescriptions: CodeBlockChangeDescription[]
	) => void;
};

export type ChangedCodeSymbolResponse = {
	changedCodeSymbols: CodeSymbolChange[];
	setChangedCodeSymbol: (newChangedCodeSymbol: CodeSymbolChange[]) => void;
};

export type CheckpointResponse = {
	timestamp: string;
	overview: string;
}[];

export interface TimeLineState {
	changelog: CheckpointResponse;
	setChangelog: (newChangeLog: CheckpointResponse) => void;
}

export type ChangesState = {
	changes: string;
};

export type SearchCompletion = {
	matchedCode: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
};

export type SearchResponse = {
	results: SearchCompletion[];
};

export type ExplanationData = {
	name: string;
	documentPath: string;
	explanation: string;
};

export type ExplanationState = {
	explanationData: ExplanationData | undefined;
	setExplanationData: (newExplanation: ExplanationData) => void;
};

export type HealthStatus = 'OK' | 'UNAVAILABLE';
export type HealthState = {
	status: HealthStatus;
	setStatus: (newStatus: HealthStatus) => void;
};

export type CommitPrepData = {
	changedFiles: string[];
	changeDescriptions: ChangeDescription[];
};

export type CommitState = {
	commitPrepData: CommitPrepData;
	setCommitPrepData: (newCommitPrepData: CommitPrepData) => void;
};

export type PageState = {
	page: PageType;
	setPage: (newPage: PageType) => void;
};

export type GitCommitRequest = {
	files: string[];
	message: string;
};
