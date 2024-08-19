/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from 'vs/base/common/htmlContent';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { IValidEditOperation } from 'vs/editor/common/model';
import { IModelContentChange } from 'vs/editor/common/textModelEvents';
import { IChatRequestVariableData } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatMarkdownContent } from 'vs/workbench/contrib/aideChat/common/aideChatService';

export interface IAideProbeData {
	id: string;
}

export interface IFollowAlongAction {
	type: 'followAlong';
	status: boolean;
}

export interface INavigateBreakdownAction {
	type: 'navigateBreakdown';
	status: boolean;
}

export interface INewIterationAction {
	type: 'newIteration';
	newPrompt: string;
}

export interface IAideProbeUserAction {
	sessionId: string;
	action: IFollowAlongAction | INavigateBreakdownAction | INewIterationAction;
}

export interface IReferenceByName {
	name: string;
	uri: URI;
}

export interface IAideProbeBreakdownContent {
	reference: IReferenceByName;
	query?: IMarkdownString;
	reason?: IMarkdownString;
	response?: IMarkdownString;
	kind: 'breakdown';
}

export interface IAideProbeGoToDefinition {
	kind: 'goToDefinition';
	uri: URI;
	name: string;
	range: Range;
	thinking: string;
}

export interface IAideProbeInitialSymbolInformation {
	uri: URI; symbolName: string; isNew: boolean; thinking: string;
}

export interface IAideProbeInitialSymbols {
	kind: 'initialSymbols';
	symbols: IAideProbeInitialSymbolInformation[];
}

export interface IAideProbeTextEdit {
	kind: 'textEdit';
	edits: WorkspaceEdit & { iterationId: string };
}

export interface IAideProbeOpenFile {
	kind: 'openFile';
	uri: URI;
}

export interface IAideProbeRepoMapGeneration {
	kind: 'repoMapGeneration';
	finished: boolean;
}

export interface IAideProbeLongContextSearch {
	kind: 'longContextSearch';
	finished: boolean;
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideProbeBreakdownContent
	| IAideProbeGoToDefinition
	| IAideProbeTextEdit
	| IAideProbeOpenFile
	| IAideProbeRepoMapGeneration
	| IAideProbeLongContextSearch
	| IAideProbeInitialSymbols;

export interface IAideProbeResponseErrorDetails {
	message: string;
}

export interface IAideProbeResult {
	errorDetails?: IAideProbeResponseErrorDetails;
}

export interface IAideProbeRequestModel {
	readonly sessionId: string;
	readonly message: string;
	readonly variableData: IChatRequestVariableData;
	readonly editMode: boolean;
	readonly codebaseSearch: boolean;
}

export interface IAideProbeStartEditEvent {
	kind: 'startEdit';
	resource: URI;
	edits: IValidEditOperation[];
}

export interface IAideProbeCompleteEditEvent {
	kind: 'completeEdit';
	resource: URI;
}

export interface IAideProbeUndoEditEvent {
	kind: 'undoEdit';
	resource: URI;
	changes: IModelContentChange[];
}

export type IAideProbeResponseEvent =
	| IAideProbeStartEditEvent
	| IAideProbeCompleteEditEvent
	| IAideProbeUndoEditEvent
	| IAideProbeGoToDefinition
	| IAideProbeBreakdownContent
	| IAideProbeInitialSymbols;

export type IAideProbeReviewUserEvent = 'accept' | 'reject';
