/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { IValidEditOperation } from 'vs/editor/common/model';
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

export interface IAideProbeUserAction {
	sessionId: string;
	action: IFollowAlongAction | INavigateBreakdownAction;
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

export interface IAideProbeTextEditPreview {
	kind: 'textEditPreview';
	reference: IReferenceByName;
	range: Range;
}

export interface IAideProbeTextEdit {
	kind: 'textEdit';
	edits: WorkspaceEdit;
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideProbeBreakdownContent
	| IAideProbeGoToDefinition
	| IAideProbeTextEditPreview
	| IAideProbeTextEdit;

export interface IAideProbeResponseErrorDetails {
	message: string;
}

export interface IAideProbeResult {
	errorDetails?: IAideProbeResponseErrorDetails;
}

export interface IAideProbeRequestModel {
	readonly sessionId: string;
	readonly message: string;
	readonly editMode: boolean;
}

export interface IAideProbeResponseModel {
	result?: IMarkdownString;
	readonly breakdowns: ReadonlyArray<IAideProbeBreakdownContent>;
	readonly goToDefinitions: ReadonlyArray<IAideProbeGoToDefinition>;
	readonly codeEditsPreview: ReadonlyArray<IAideProbeTextEditPreview>;

	revertEdits(): void;
}

export interface IAideProbeModel {
	onDidChange: Event<void>;
	onNewEvent: Event<IAideProbeResponseEvent>;

	sessionId: string;
	request: IAideProbeRequestModel | undefined;
	response: IAideProbeResponseModel | undefined;

	isComplete: boolean;
	requestInProgress: boolean;

	revertEdits(): void;
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

export type IAideProbeResponseEvent = IAideProbeStartEditEvent | IAideProbeCompleteEditEvent | IAideProbeGoToDefinition | IAideProbeBreakdownContent;

export type IAideProbeReviewUserEvent = 'accept' | 'reject';
