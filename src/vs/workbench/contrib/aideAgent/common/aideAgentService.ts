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
import { ISelection } from '../../../../editor/common/core/selection.js';
import { Command, Location, TextEdit, WorkspaceEdit } from '../../../../editor/common/languages.js';
import { FileType } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData, IChatAgentResult } from './aideAgentAgents.js';
import { AgentMode, AgentScope, ChatModel, IChatModel, IChatRequestVariableData, IChatRequestVariableEntry, IChatResponseModel, IExportableChatData, ISerializableChatData } from './aideAgentModel.js';
import { IParsedChatRequest } from './aideAgentParserTypes.js';
import { IChatParserContext } from './aideAgentRequestParser.js';
import { IChatRequestVariableValue } from './aideAgentVariables.js';

export interface IChatRequest {
	message: string;
	variables: Record<string, IChatRequestVariableValue[]>;
}

export interface IChatResponseErrorDetails {
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

export interface IAideAgentCodeEditsItem {
	uri: URI;
	range: Range;
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

export interface IChatContentReference {
	reference: URI | Location | IChatContentVariableReference | string;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } };
	kind: 'reference';
}

export interface IChatCodeCitation {
	value: URI;
	license: string;
	snippet: string;
	kind: 'codeCitation';
}

export interface IChatContentInlineReference {
	inlineReference: URI | Location | IWorkspaceSymbol;
	name?: string;
	kind: 'inlineReference';
}

export interface IChatAgentDetection {
	agentId: string;
	command?: IChatAgentCommand;
	kind: 'agentDetection';
}

export interface IChatMarkdownContent {
	content: IMarkdownString;
	kind: 'markdownContent';
}

export interface IChatTreeData {
	treeData: IChatResponseProgressFileTreeData;
	kind: 'treeData';
}

export interface IChatProgressMessage {
	content: IMarkdownString;
	kind: 'progressMessage';
}

export interface IChatTask extends IChatTaskDto {
	deferred: DeferredPromise<string | void>;
	progress: (IChatWarningMessage | IChatContentReference)[];
	onDidAddProgress: Event<IChatWarningMessage | IChatContentReference>;
	add(progress: IChatWarningMessage | IChatContentReference): void;

	complete: (result: string | void) => void;
	task: () => Promise<string | void>;
	isSettled: () => boolean;
}

export interface IChatTaskDto {
	content: IMarkdownString;
	kind: 'progressTask';
}

export interface IChatTaskResult {
	content: IMarkdownString | void;
	kind: 'progressTaskResult';
}

export interface IChatWarningMessage {
	content: IMarkdownString;
	kind: 'warning';
}

export interface IChatAgentVulnerabilityDetails {
	title: string;
	description: string;
}

export interface IChatResponseCodeblockUriPart {
	kind: 'codeblockUri';
	uri: URI;
}

export interface IChatAgentMarkdownContentWithVulnerability {
	content: IMarkdownString;
	vulnerabilities: IChatAgentVulnerabilityDetails[];
	kind: 'markdownVuln';
}


export interface ISingleCommandButton {
	command: Command;
	buttonOptions?: {
		title?: string;
		look?: 'primary' | 'secondary';
		codiconId?: string;
	};
}

export interface IChatCommandButton extends ISingleCommandButton {
	kind: 'command';
}

export interface IChatCommandGroup {
	commands: ISingleCommandButton[];
	kind: 'commandGroup';
}

export interface IChatMoveMessage {
	uri: URI;
	range: IRange;
	kind: 'move';
}

export interface IChatTextEdit {
	uri: URI;
	edits: TextEdit[];
	kind: 'textEdit';
}

export interface IChatCodeEdit {
	edits: WorkspaceEdit;
	kind: 'codeEdit';
}

export interface IChatConfirmation {
	title: string;
	message: string;
	data: any;
	buttons?: string[];
	isUsed?: boolean;
	kind: 'confirmation';
}

export enum ChatStreamingState {
	Loading = 'loading',
	EditsStarted = 'editsStarted',
	WaitingFeedback = 'waitingFeedback',
	Finished = 'finished',
	Cancelled = 'cancelled',
}

export enum ChatStreamingStateLoadingLabel {
	UnderstandingRequest = 'understandingRequest',
	ExploringCodebase = 'exploringCodebase',
	Reasoning = 'reasoning',
	Generating = 'generating',
}

export interface IChatAideAgentPlanRegenerateInformationPart {
	kind: 'planRegeneration';
	sessionId: string;
	exchangeId: string;
}

export interface IChatThinkingForEditPart {
	kind: 'thinkingForEdit';
	sessionId: string;
	exchangeId: string;
	thinkingDelta: IMarkdownString;
}

export interface IChatStreamingState {
	kind: 'streamingState';
	state: `${ChatStreamingState}`;
	loadingLabel?: `${ChatStreamingStateLoadingLabel}`;
	files: string[];
	sessionId: string;
	exchangeId: string;
	isError: boolean;
	message?: string;
}

export enum ChatEditsState {
	Loading = 'loading',
	MarkedComplete = 'markedComplete',
	Cancelled = 'cancelled',
}

// Use the same enum as above, rename every plan to multi-step edit
export enum ChatPlanState {
	Started = 'Started',
	Complete = 'Complete',
	Cancelled = 'Cancelled',
	Accepted = 'Accepted',
}

export interface IChatEditsInfo {
	kind: 'editsInfo';
	state: `${ChatEditsState}`;
	isStale: boolean;
	files: URI[];
	sessionId: string;
	exchangeId: string;
	description?: IMarkdownString;
}

export interface IChatPlanInfo {
	kind: 'planInfo';
	state: `${ChatPlanState}`;
	isStale: boolean;
	sessionId: string;
	exchangeId: string;
	description?: IMarkdownString;
}

export interface IChatPlanStep {
	description: IMarkdownString;
	descriptionDelta: IMarkdownString | null;
	files: URI[];
	sessionId: string;
	exchangeId: string;
	title: string;
	index: number;
	isLast: boolean;
	kind: 'planStep';
}

export interface IChatEndResponse {
	kind: 'endResponse';
}

export interface ICodePlanEditInfo {
	kind: 'planEditInfo';
	sessionId: string;
	exchangeId: string;
	currentStepIndex: number;
	startStepIndex: number;
}

export interface IChatCheckpointAdded {
	kind: 'checkpointAdded';
	sessionId: string;
	exchangeId: string;
}

export interface IChatRollbackCompleted {
	kind: 'rollbackCompleted';
	sessionId: string;
	exchangeId: string;
	exchangesRemoved: number;
}


export type IChatProgress =
	| IChatMarkdownContent
	| IChatAgentMarkdownContentWithVulnerability
	| IChatTreeData
	| IChatUsedContext
	| IChatContentReference
	| IChatContentInlineReference
	| IChatCodeCitation
	| IChatAgentDetection
	| IChatProgressMessage
	| IChatTask
	| IChatTaskResult
	| IChatCommandButton
	| IChatCommandGroup
	| IChatWarningMessage
	| IChatTextEdit
	| IChatCodeEdit
	| IChatMoveMessage
	| IChatResponseCodeblockUriPart
	| IChatConfirmation
	| IChatStreamingState
	| IChatPlanInfo
	| IChatEditsInfo
	| IChatPlanStep
	| IChatEndResponse
	| IChatThinkingForEditPart
	| IChatRollbackCompleted
	| IChatCheckpointAdded
	| ICodePlanEditInfo
	| IChatAideAgentPlanRegenerateInformationPart;

export interface IChatFollowup {
	kind: 'reply';
	message: string;
	agentId: string;
	subCommand?: string;
	title?: string;
	tooltip?: string;
}

export enum ChatAgentVoteDirection {
	Down = 0,
	Up = 1
}

export enum ChatAgentVoteDownReason {
	IncorrectCode = 'incorrectCode',
	DidNotFollowInstructions = 'didNotFollowInstructions',
	IncompleteCode = 'incompleteCode',
	MissingContext = 'missingContext',
	PoorlyWrittenOrFormatted = 'poorlyWrittenOrFormatted',
	RefusedAValidRequest = 'refusedAValidRequest',
	OffensiveOrUnsafe = 'offensiveOrUnsafe',
	Other = 'other',
	WillReportIssue = 'willReportIssue'
}

export interface IChatVoteAction {
	kind: 'vote';
	direction: ChatAgentVoteDirection;
	reason: ChatAgentVoteDownReason | undefined;
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

export interface IChatApplyAction {
	kind: 'apply';
	codeBlockIndex: number;
	totalCharacters: number;
	newFile?: boolean;
	codeMapper?: string;
	editsProposed: boolean;
}


export interface IChatTerminalAction {
	kind: 'runInTerminal';
	codeBlockIndex: number;
	languageId?: string;
}

export interface IChatCommandAction {
	kind: 'command';
	commandButton: IChatCommandButton;
}

export interface IChatFollowupAction {
	kind: 'followUp';
	followup: IChatFollowup;
}

export interface IChatBugReportAction {
	kind: 'bug';
}

export interface IChatInlineChatCodeAction {
	kind: 'inlineChat';
	action: 'accepted' | 'discarded';
}

export type ChatUserAction = IChatVoteAction | IChatCopyAction | IChatInsertAction | IChatApplyAction | IChatTerminalAction | IChatCommandAction | IChatFollowupAction | IChatBugReportAction | IChatInlineChatCodeAction;

export interface IChatUserActionEvent {
	action: ChatUserAction;
	agentId: string | undefined;
	command: string | undefined;
	sessionId: string;
	requestId: string;
	result: IChatAgentResult | undefined;
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
	message: string | ReadonlyArray<IChatProgress>;
	result?: IChatAgentResult;
	followups?: IChatFollowup[];
}

export interface IChatDetail {
	sessionId: string;
	title: string;
	lastMessageDate: number;
	isActive: boolean;
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

export interface IChatEditorLocationData {
	type: ChatAgentLocation.Editor;
	document: URI;
	selection: ISelection;
	wholeRange: IRange;
}

export interface IChatNotebookLocationData {
	type: ChatAgentLocation.Notebook;
	sessionInputUri: URI;
}

export interface IChatTerminalLocationData {
	type: ChatAgentLocation.Terminal;
	// TBD
}

export type IChatLocationData = IChatEditorLocationData | IChatNotebookLocationData | IChatTerminalLocationData;

export interface IChatSendRequestOptions {
	agentMode?: AgentMode;
	agentScope?: AgentScope;
	userSelectedModelId?: string;
	location?: ChatAgentLocation;
	locationData?: IChatLocationData;
	parserContext?: IChatParserContext;
	attempt?: number;
	noCommandDetection?: boolean;
	acceptedConfirmationData?: any[];
	rejectedConfirmationData?: any[];
	attachedContext?: IChatRequestVariableEntry[];

	/** The target agent ID can be specified with this property instead of using @ in 'message' */
	agentId?: string;
	slashCommand?: string;

	/**
	 * The label of the confirmation action that was selected.
	 */
	confirmation?: string;
}

export const IAideAgentService = createDecorator<IAideAgentService>('IAideAgentService');

export interface IAideAgentService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	isEnabled(location: ChatAgentLocation): boolean;
	hasSessions(): boolean;
	startSessionWithId(location: ChatAgentLocation, token: CancellationToken, sessionId: string, isPassthrough?: boolean): ChatModel | undefined;
	startSession(location: ChatAgentLocation, token: CancellationToken, isPassthrough?: boolean): ChatModel | undefined;
	getSession(sessionId: string): IChatModel | undefined;
	getOrRestoreSession(sessionId: string): IChatModel | undefined;
	loadSessionFromContent(data: IExportableChatData | ISerializableChatData): IChatModel | undefined;

	sendIterationRequest(sessionId: string, exchangeId: string, iterationQuery: string, options?: IChatSendRequestOptions): Promise<void>;
	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string, options?: IChatSendRequestOptions): Promise<IChatSendRequestData | undefined>;
	// TODO(@ghostwriternr): This method already seems unused. Remove it?
	// resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions): Promise<void>;
	// TODO(@ghostwriternr): Remove this if we no longer need to remove requests.
	// removeRequest(sessionid: string, requestId: string): Promise<void>;
	/**
	 * Push incremental progress events here to a sessionId and exchangeId implicitly
	 * from the system
	 *
	 * Such requests can only update the UI elements and not change the storage layer at all
	 * (nothing happens to the sidecar)
	 */
	pushProgress(sessionId: string, progress: IChatProgress): void;

	cancelExchange(exchangeId: string): void;
	cancelAllExchangesForSession(): void;

	initiateResponse(sessionId: string): Promise<{ responseId: string; callback: (p: IChatProgress) => void; token: CancellationToken }>;

	clearSession(sessionId: string): void;
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void;
	getHistory(): IChatDetail[];
	setChatSessionTitle(sessionId: string, title: string): void;
	clearAllHistoryEntries(): void;
	removeHistoryEntry(sessionId: string): void;

	onDidPerformUserAction: Event<IChatUserActionEvent>;
	notifyUserAction(event: IChatUserActionEvent): void;
	onDidDisposeSession: Event<{ sessionId: string; reason: 'initializationFailed' | 'cleared' }>;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void;
	handleUserActionForSession(sessionId: string, exchangeId: string, stepIndex: number | undefined, agentId: string | undefined, accepted: boolean): void;
	handleUserActionUndoSession(sessionId: string, exchangeId: string): Promise<void>;
}

export const KEYWORD_ACTIVIATION_SETTING_ID = 'accessibility.voice.keywordActivation';
