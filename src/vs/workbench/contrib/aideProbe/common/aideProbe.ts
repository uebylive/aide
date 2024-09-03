/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from 'vs/base/common/htmlContent';
import { URI } from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import { DocumentSymbol, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
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

export interface IContextChangeAction {
	type: 'contextChange';
	newContext: string[];
}

export interface IFollowUpRequestAction {
	type: 'followUpRequest';
}

export interface IAideProbeSessionAction {
	sessionId: string;
	action: IFollowAlongAction | INavigateBreakdownAction | INewIterationAction | IFollowUpRequestAction;
}

export type IAideProbeUserAction = IContextChangeAction;

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
	uri: URI;
	symbolName: string;
	isNew: boolean;
	thinking: string;
}

export interface IAideProbeInitialSymbols {
	kind: 'initialSymbols';
	symbols: IAideProbeInitialSymbolInformation[];
}

export interface IAideProbeTextEdit {
	kind: 'textEdit';
	edits: WorkspaceEdit;
}

export interface IAideProbeOpenFile {
	kind: 'openFile';
	uri: URI;
}

export interface IAideReferenceFound {
	kind: 'referenceFound';
	references: Record<string, number>;
}

export interface IAideProbeRepoMapGeneration {
	kind: 'repoMapGeneration';
	finished: boolean;
}

export interface IAideProbeLongContextSearch {
	kind: 'longContextSearch';
	finished: boolean;
}

export interface IAideProbeIterationFinished {
	kind: 'iterationFinished';
	edits: WorkspaceEdit;
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideProbeBreakdownContent
	| IAideProbeGoToDefinition
	| IAideProbeTextEdit
	| IAideProbeOpenFile
	| IAideProbeRepoMapGeneration
	| IAideProbeLongContextSearch
	| IAideReferenceFound
	| IAideProbeInitialSymbols
	| IAideProbeIterationFinished;

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
	readonly codebaseSearch: boolean;
	readonly mode: IAideProbeMode;
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

export interface IAideProbeEditEvent {
	kind: 'edit';
	resource: URI;
	edit: TextEdit;
}

export interface IAideProbeDiscardAll {
	kind: 'discardAll';
}

export interface IAideProbeAnchorStart {
	kind: 'anchorStart';
	selection: AnchorEditingSelection;
}

export type IAideProbeResponseEvent =
	| IAideProbeStartEditEvent
	| IAideProbeCompleteEditEvent
	| IAideProbeUndoEditEvent
	| IAideProbeGoToDefinition
	| IAideProbeBreakdownContent
	| IAideProbeInitialSymbols
	| IAideProbeEditEvent
	| IAideProbeDiscardAll
	| IAideProbeAnchorStart;

export type IAideProbeReviewUserEvent = 'accept' | 'reject';


export interface AnchorEditingSelection {
	uri: URI;
	selection: Selection;
	symbols: DocumentSymbol[];
}

export const enum AideProbeMode {
	EXPLORE = 'EXPLORE',
	AGENTIC = 'AGENTIC',
	ANCHORED = 'ANCHORED',
	FOLLOW_UP = 'FOLLOW_UP'
}

export type IAideProbeMode = keyof typeof AideProbeMode;

export const enum AideProbeStatus {
	INACTIVE = 'INACTIVE',
	IN_PROGRESS = 'IN_PROGRESS',
	ITERATION_FINISHED = 'ITERATION_FINISHED',
	IN_REVIEW = 'IN_REVIEW'
}

export type IAideProbeStatus = keyof typeof AideProbeStatus;
