/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { Command, Location, TextEdit } from '../../../../editor/common/languages.js';
import { FileType } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AideChatAgentLocation, IAideChatAgentResult, IChatAgentCommand, IChatAgentData } from '../../../../workbench/contrib/aideChat/common/aideChatAgents.js';
import { ChatModel, IAideChatRequestVariableEntry, IChatModel, IChatRequestModel, IChatRequestVariableData, IChatResponseModel, IExportableChatData, ISerializableChatData } from '../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { IParsedChatRequest } from '../../../../workbench/contrib/aideChat/common/aideChatParserTypes.js';
import { IChatParserContext } from '../../../../workbench/contrib/aideChat/common/aideChatRequestParser.js';
import { IAideChatRequestVariableValue } from '../../../../workbench/contrib/aideChat/common/aideChatVariables.js';
import { IChatCodeCitation, IChatMoveMessage, IChatResponseCodeblockUriPart } from '../../chat/common/chatService.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';

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

export enum ChatResponseReferencePartStatusKind {
	Complete = 1,
	Partial = 2,
	Omitted = 3
}

export interface IAideChatContentReference {
	reference: URI | Location | IChatContentVariableReference | string;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } };
	kind: 'reference';
}

export interface IAideChatContentInlineReference {
	inlineReference: URI | Location | IWorkspaceSymbol;
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
	| IAideChatContentInlineReference
	| IChatCodeCitation
	| IAideChatAgentDetection
	| IAideChatProgressMessage
	| IAideChatTask
	| IAideChatTaskResult
	| IAideChatCommandButton
	| IAideChatWarningMessage
	| IAideChatTextEdit
	| IChatMoveMessage
	| IChatResponseCodeblockUriPart
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

export interface IAideChatFollowupAction {
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

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatTerminalAction | IChatCommandAction | IAideChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction;

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
