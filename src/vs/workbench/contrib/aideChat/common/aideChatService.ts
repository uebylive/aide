/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Command, Location, TextEdit } from 'vs/editor/common/languages';
import { FileType } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideChatAgentLocation, IChatAgentCommand, IChatAgentData, IAideChatAgentResult } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';
import { ChatModel, IChatModel, IChatRequestModel, IChatRequestVariableData, IAideChatRequestVariableEntry, IChatResponseModel, IExportableChatData, ISerializableChatData } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/aideChat/common/aideChatParserTypes';
import { IChatParserContext } from 'vs/workbench/contrib/aideChat/common/aideChatRequestParser';
import { AideMode } from 'vs/workbench/contrib/aideChat/common/aideChatServiceImpl';
import { IAideChatRequestVariableValue } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';

export interface IChatRequest {
	message: string;
	variables: Record<string, IAideChatRequestVariableValue[]>;
}

export interface IAideChatResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean;
	responseIsFiltered?: boolean;
	responseIsRedacted?: boolean;
}

export interface IChatResponseProgressFileTreeData {
	label: string;
	uri: URI;
	type?: FileType;
	children?: IChatResponseProgressFileTreeData[];
}

export type IDocumentContext = {
	uri: URI;
	version: number;
	ranges: IRange[];
};

export function isIDocumentContext(obj: unknown): obj is IDocumentContext {
	return (
		!!obj &&
		typeof obj === 'object' &&
		'uri' in obj && obj.uri instanceof URI &&
		'version' in obj && typeof obj.version === 'number' &&
		'ranges' in obj && Array.isArray(obj.ranges) && obj.ranges.every(Range.isIRange)
	);
}

export interface IChatUsedContext {
	documents: IDocumentContext[];
	kind: 'usedContext';
}

export function isIUsedContext(obj: unknown): obj is IChatUsedContext {
	return (
		!!obj &&
		typeof obj === 'object' &&
		'documents' in obj &&
		Array.isArray(obj.documents) &&
		obj.documents.every(isIDocumentContext)
	);
}

export interface IChatContentVariableReference {
	variableName: string;
	value?: URI | Location;
}

export interface IAideChatContentReference {
	reference: URI | Location | IChatContentVariableReference;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	kind: 'reference';
}

export interface IAideChatBreakdown {
	content: IMarkdownString;
	reference?: URI | Location;
	kind: 'breakdown';
}

export interface IAideChatContentInlineReference {
	inlineReference: URI | Location;
	name?: string;
	kind: 'inlineReference';
}

export interface IAideChatAgentDetection {
	agentId: string;
	command?: IChatAgentCommand;
	kind: 'agentDetection';
}

export interface IAideChatMarkdownContent {
	content: IMarkdownString;
	kind: 'markdownContent';
}

export interface IChatTreeData {
	treeData: IChatResponseProgressFileTreeData;
	kind: 'treeData';
}

export interface IAideChatProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface IAideChatTask extends IAideChatTaskDto {
	deferred: DeferredPromise<string | void>;
	progress: (IAideChatWarningMessage | IAideChatContentReference)[];
	onDidAddProgress: Event<IAideChatWarningMessage | IAideChatContentReference>;
	add(progress: IAideChatWarningMessage | IAideChatContentReference): void;

	complete: (result: string | void) => void;
	task: () => Promise<string | void>;
	isSettled: () => boolean;
}

export interface IAideChatTaskDto {
	content: IMarkdownString;
	kind: 'progressTask';
}

export interface IAideChatTaskResult {
	content: IMarkdownString | void;
	kind: 'progressTaskResult';
}

export interface IAideChatWarningMessage {
	content: IMarkdownString;
	kind: 'warning';
}

export interface IChatAgentVulnerabilityDetails {
	title: string;
	description: string;
}

export interface IAideChatAgentMarkdownContentWithVulnerability {
	content: IMarkdownString;
	vulnerabilities: IChatAgentVulnerabilityDetails[];
	kind: 'markdownVuln';
}

export interface IAideChatCommandButton {
	command: Command;
	kind: 'command';
}

export interface IAideChatTextEdit {
	uri: URI;
	edits: TextEdit[];
	kind: 'textEdit';
}

export interface IAideChatConfirmation {
	title: string;
	message: string;
	data: any;
	isUsed?: boolean;
	kind: 'confirmation';
}

export type IAideChatProgress =
	| IAideChatMarkdownContent
	| IAideChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatUsedContext
	| IAideChatContentReference
	| IAideChatBreakdown
	| IAideChatContentInlineReference
	| IAideChatAgentDetection
	| IAideChatProgressMessage
	| IAideChatTask
	| IAideChatTaskResult
	| IAideChatCommandButton
	| IAideChatWarningMessage
	| IAideChatTextEdit
	| IAideChatConfirmation;

export interface IAideChatFollowup {
	kind: 'reply';
	message: string;
	agentId: string;
	subCommand?: string;
	title?: string;
	tooltip?: string;
}

export enum AideChatAgentVoteDirection {
	Down = 0,
	Up = 1
}

export interface IChatVoteAction {
	kind: 'vote';
	direction: AideChatAgentVoteDirection;
	reportIssue?: boolean;
}

export enum ChatCopyKind {
	// Keyboard shortcut or context menu
	Action = 1,
	Toolbar = 2
}

export interface IChatCopyAction {
	kind: 'copy';
	codeBlockIndex: number;
	copyKind: ChatCopyKind;
	copiedCharacters: number;
	totalCharacters: number;
	copiedText: string;
}

export interface IChatInsertAction {
	kind: 'insert';
	codeBlockIndex: number;
	totalCharacters: number;
	newFile?: boolean;
}

export interface IChatTerminalAction {
	kind: 'runInTerminal';
	codeBlockIndex: number;
	languageId?: string;
}

export interface IChatCommandAction {
	kind: 'command';
	commandButton: IAideChatCommandButton;
}

export interface IChatFollowupAction {
	kind: 'followUp';
	followup: IAideChatFollowup;
}

export interface IChatBugReportAction {
	kind: 'bug';
}

export interface IChatInlineChatCodeAction {
	kind: 'inlineChat';
	action: 'accepted' | 'discarded';
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction;

export interface IAideChatUserActionEvent {
	action: ChatUserAction;
	agentId: string | undefined;
	sessionId: string;
	requestId: string;
	result: IAideChatAgentResult | undefined;
}

export interface IChatDynamicRequest {
	/**
	 * The message that will be displayed in the UI
	 */
	message: string;

	/**
	 * Any extra metadata/context that will go to the provider.
	 */
	metadata?: any;
}

export interface IChatCompleteResponse {
	message: string | ReadonlyArray<IAideChatProgress>;
	result?: IAideChatAgentResult;
	followups?: IAideChatFollowup[];
}

export interface IChatDetail {
	sessionId: string;
	title: string;
}

export interface IChatProviderInfo {
	id: string;
}

export interface IChatTransferredSessionData {
	sessionId: string;
	inputValue: string;
}

export interface IChatSendRequestResponseState {
	responseCreatedPromise: Promise<IChatResponseModel>;
	responseCompletePromise: Promise<void>;
}

export interface IChatSendRequestData extends IChatSendRequestResponseState {
	agent: IChatAgentData;
	slashCommand?: IChatAgentCommand;
}

export interface IChatSendRequestOptions {
	location?: AideChatAgentLocation;
	parserContext?: IChatParserContext;
	attempt?: number;
	noCommandDetection?: boolean;
	acceptedConfirmationData?: any[];
	rejectedConfirmationData?: any[];
	attachedContext?: IAideChatRequestVariableEntry[];

	/** The target agent ID can be specified with this property instead of using @ in 'message' */
	agentId?: string;
	slashCommand?: string;
}

export const IAideChatService = createDecorator<IAideChatService>('IAideChatService');

export interface IAideChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;
	aideMode: AideMode;
	switchMode(): AideMode;

	isEnabled(location: AideChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSession(location: AideChatAgentLocation, token: CancellationToken): ChatModel | undefined;
	getSession(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionId: string): IChatModel | undefined;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined;

	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined>;

	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void>;
	adoptRequest(sessionId: string, request: IChatRequestModel): Promise<void>;
	removeRequest(sessionid: string, requestId: string): Promise<void>;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(sessionId: string): void;
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void;
	getHistory(): IChatDetail[];
	clearAllHistoryEntries(): void;
	removeHistoryEntry(sessionId: string): void;

	onDidPerformUserAction: Event<IAideChatUserActionEvent>;
	notifyUserAction(event: IAideChatUserActionEvent): void;
	onDidDisposeSession: Event<{ sessionId: string; reason: 'initializationFailed' | 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
