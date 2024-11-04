/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum AideAgentMode {
		Edit = 1,
		Plan = 2,
		Chat = 3
	}

	export enum AideAgentScope {
		Selection = 1,
		PinnedContext = 2,
		Codebase = 3
	}

	export enum AideAgentPlanState {
		Started = 'Started',
		Complete = 'Complete',
		Cancelled = 'Cancelled',
		Accepted = 'Accepted',
	}

	export type AideAgentPlanStateType = `${AideAgentPlanState}`;

	export enum AideAgentEditsState {
		Loading = 'loading',
		MarkedComplete = 'markedComplete',
		Cancelled = 'cancelled',
	}

	export type AideAgentEditsStateType = `${AideAgentEditsState}`;

	export enum AideAgentStreamingStateEnum {
		Loading = 'loading',
		WaitingFeedback = 'waitingFeedback',
		// We can show if the edits have started using this
		EditsStarted = 'editsStarted',
		Finished = 'finished',
		// NOTE: This is a dynamic properly, ideally we should be using either of
		// finished or waitingFeedback, but since that part is not built yet
		// we will derive our state from the Cancelled
		// Cancelled can go to Finished | WaitingFeedback
		Cancelled = 'cancelled',
	}

	export type AideAgentStreamingStateType = `${AideAgentStreamingStateEnum}`;

	export enum AideAgentStreamingStateLoadingLabel {
		UnderstandingRequest = 'understandingRequest',
		ExploringCodebase = 'exploringCodebase',
		Reasoning = 'reasoning',
		Generating = 'generating',
	}

	export type AideAgentStreamingStateLoadingLabelType = `${AideAgentStreamingStateLoadingLabel}`;

	export interface AideAgentFileReference extends ChatPromptReference {
		readonly id: 'vscode.file';
		readonly value: {
			uri: Uri;
			range: Range;
		};
	}

	export interface AideAgentCodeReference extends ChatPromptReference {
		readonly id: 'vscode.code';
		readonly value: {
			uri: Uri;
			range: Range;
		};
	}

	// This is a cool looking type, but TypeScript currently doesn't enforce it. But it helps understand
	// the intent for us to use it correctly.
	export type AideAgentPromptReference =
		| AideAgentFileReference
		| AideAgentCodeReference
		| (Omit<ChatPromptReference, 'id'> & { id: Exclude<string, 'vscode.file'> });

	export interface AideAgentRequest extends ChatRequest {
		// is this the exchange id, if so it should explicity be named that instead of id :|
		readonly exchangeId: string;
		readonly sessionId: string;
		readonly mode: AideAgentMode;
		readonly scope: AideAgentScope;
		readonly references: readonly AideAgentPromptReference[];
	}

	export class ChatResponseCodeEditPart {
		edits: WorkspaceEdit;
		constructor(edits: WorkspaceEdit);
	}

	export type AideAgentResponsePart = ExtendedChatResponsePart | ChatResponseCodeEditPart;

	export enum AideButtonLook {
		Primary = 'primary',
		Secondary = 'secondary'
	}

	export interface AideChatStep {
		/**
		 * The index of the step in the plan
		 */
		readonly index: number;
		/**
		 * Wether it's the last step in the plan
		 */
		readonly isLast: boolean;
		/*
		 * Description of the edits
		 */
		readonly description: string | MarkdownString;
		/*
		 * The session id of the plan
		 */
		readonly sessionId: string;
		/**
		 * The exchange id of the plan (since we can revert and generate the plan a new
		 * the exchange id might be tied to a previous plan)
		 */
		readonly exchangeId: string;

		/**
		 * The title of the step in the plan
		 */
		readonly title: string;
		/**
		 * Progressive update on the description over here
		 */
		readonly descriptionDelta: string | MarkdownString | null;
		/**
		 * The files which are part of the step
		 */
		readonly files: Uri[];
	}


	export interface AideAgentPlanInfo {
		/*
		 * State of the plans
		 */
		readonly state: AideAgentPlanStateType;
		/*
		 * Wether the plans are stale
		 */
		readonly isStale: boolean;
		/*
		 * Description of the plans
		 */
		readonly description?: string | MarkdownString;
		/*
		 * The session id of the plan
		 */
		readonly sessionId: string;
		/*
		 * The session id of the plan
		 */
		readonly exchangeId: string;
	}

	export interface AideAgentThinkingForEdit {
		readonly exchangeId: string;
		readonly sessionId: string;
		readonly thinkingDelta: string;
	}

	export interface AideAgentPlanRegenerateInformation {
		readonly sessionId: string;
		readonly exchangeId: string;
	}

	export interface AideAgentEditsInfo {
		/*
		 * State of the edits
		 */
		readonly state: AideAgentEditsStateType;
		/*
		 * Wether the edits are stale
		 */
		readonly isStale: boolean;
		/*
		 * Files affected by the change
		 */
		readonly files: Uri[];
		/*
		 * Description of the edits
		 */
		readonly description?: string | MarkdownString;
		/*
		 * The session id of the plan
		 */
		readonly sessionId: string;
		/*
		 * The session id of the plan
		 */
		readonly exchangeId: string;
	}


	export interface AideRollbackCompleted {
		/*
	 * The session id of the plan
	 */
		readonly sessionId: string;
		/*
		 * The session id of the plan
		 */
		readonly exchangeId: string;
		/*
		 * The number of edits added
		 */
		readonly exchangesRemoved: number;
	}

	export interface AideCommand {
		/**
		 * VSCode command to execute
		 */
		readonly command: Command;

		/**
		 * Visual options for the button
		 */
		readonly buttonOptions?: {
			title?: string;
			look?: `${AideButtonLook}`;
			codiconId?: string;
		};
	}

	export interface AideAgentStreamingState {
		state: `${AideAgentStreamingStateEnum}`;
		loadingLabel?: `${AideAgentStreamingStateLoadingLabel}`;
		exchangeId: string;
		// the files which are part of the streaming state
		// what we really want is to tie this state to the edits started
		// state, but .... 🫡 (I am lazy)
		files: string[];
		sessionId: string;
		isError: boolean;
		message?: string;
	}

	export interface AideAgentResponseStream extends Omit<ChatResponseStream, 'button'> {
		editsInfo(edits: AideAgentEditsInfo): void;
		planInfo(plan: AideAgentPlanInfo): void;
		button(command: AideCommand): void;
		buttonGroup(commands: AideCommand[]): void;
		streamingState(state: AideAgentStreamingState): void;
		codeEdit(edits: WorkspaceEdit): void;
		step(step: AideChatStep): void;
		push(part: AideAgentResponsePart): void;
		thinkingForEdit(part: AideAgentThinkingForEdit): void;
		regeneratePlan(planInformation: AideAgentPlanRegenerateInformation): void;
		close(): void;
	}

	export interface AideAgentEventSenderResponse {
		stream: AideAgentResponseStream;
		exchangeId: string;
		token: CancellationToken;
	}

	export enum AideSessionExchangeUserAction {
		AcceptAll = 1,
		RejectAll = 2,
	}

	export type AideSessionHandler = (id: string) => void;
	export type AideSessionHandleUserAction = (sessionId: string, exchangeId: string, stepIndex: number | undefined, action: AideSessionExchangeUserAction) => void;
	export type AideSessionUndoAction = (sessionId: string, exchangeId: string) => void;
	export type AideSessionIterationRequest = (sessionId: string, exchangeId: string, iterationQuery: string, references: readonly AideAgentPromptReference[]) => void;
	export type AideSessionEventHandler = (event: AideAgentRequest, token: CancellationToken) => ProviderResult<ChatResult | void>;
	export type AideSessionEventSender = (sessionId: string) => Thenable<AideAgentEventSenderResponse | undefined>;

	export interface AideSessionParticipant {
		newSession: AideSessionHandler;
		handleEvent: AideSessionEventHandler;
		// Used to handle the exchange which the user has taken on a chat exchange
		// NOTE: This might not be correct, but we are in a time-crunch and this will work, refrain from doing
		// changes until necessary
		handleExchangeUserAction: AideSessionHandleUserAction;
		handleSessionUndo: AideSessionUndoAction;
		handleSessionIterationRequest: AideSessionIterationRequest;
	}

	interface AideSessionAgent extends Omit<ChatParticipant, 'requestHandler'> {
		requestHandler: AideSessionEventHandler;
		readonly initResponse: AideSessionEventSender;
	}

	export namespace aideAgent {
		export function createChatParticipant(id: string, resolver: AideSessionParticipant): AideSessionAgent;
		export function registerChatParticipantDetectionProvider(participantDetectionProvider: ChatParticipantDetectionProvider): Disposable;
		export function registerChatVariableResolver(id: string, name: string, userDescription: string, modelDescription: string | undefined, isSlow: boolean | undefined, resolver: ChatVariableResolver, fullName?: string, icon?: ThemeIcon): Disposable;
		export function registerMappedEditsProvider2(provider: MappedEditsProvider2): Disposable;
	}
}
