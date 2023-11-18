/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface CSChatEditorSlashCommand {
		command: string;
		detail?: string;
		refer?: boolean;
		/**
		 * Whether the command should execute as soon
		 * as it is entered. Defaults to `false`.
		 */
		executeImmediately?: boolean;
		// kind: CompletionItemKind;
	}

	// todo@API make classes
	export interface CSChatEditorSession {
		placeholder?: string;
		input?: string;
		slashCommands?: CSChatEditorSlashCommand[];
		wholeRange?: Range;
		message?: string;
	}

	// todo@API make classes
	export interface CSChatEditorRequest {
		prompt: string;
		selection: Selection;
		wholeRange: Range;
		attempt: number;
		live: boolean;
	}

	// todo@API make classes
	export interface CSChatEditorResponse {
		edits: TextEdit[] | WorkspaceEdit;
		contents?: MarkdownString;
		placeholder?: string;
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface CSChatEditorMessageResponse {
		contents: MarkdownString;
		placeholder?: string;
		wholeRange?: Range;
	}

	export interface CSChatEditorProgressItem {
		message?: string;
		edits?: TextEdit[];
		editsShouldBeInstant?: boolean;
		slashCommand?: CSChatEditorSlashCommand;
		content?: string | MarkdownString;
	}

	export enum CSChatEditorResponseFeedbackKind {
		Unhelpful = 0,
		Helpful = 1,
		Undone = 2,
		Accepted = 3,
		Bug = 4
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
	}

	export interface CSChatEditorSessionProviderMetadata {
		label?: string;
		supportReportIssue?: boolean;
	}

	export interface CSChatEditorReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;
	}

	export interface CSChatEditorSessionProvider<S extends CSChatEditorSession = CSChatEditorSession, R extends CSChatEditorResponse | CSChatEditorMessageResponse = CSChatEditorResponse | CSChatEditorMessageResponse> {

		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareCSChatEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<S>;

		provideCSChatEditorResponse(session: S, request: CSChatEditorRequest, progress: Progress<CSChatEditorProgressItem>, token: CancellationToken): ProviderResult<R>;

		provideFollowups?(session: S, response: R, token: CancellationToken): ProviderResult<CSChatEditorReplyFollowup[]>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleCSChatEditorResponseFeedback?(session: S, response: R, kind: CSChatEditorResponseFeedbackKind): void;
	}

	export interface CSChatSessionParticipantInformation {
		name: string;

		/**
		 * A full URI for the icon of the participant.
		 */
		icon?: Uri;
	}

	export interface CSChatSession {
		requester: CSChatSessionParticipantInformation;
		responder: CSChatSessionParticipantInformation;
		inputPlaceholder?: string;
	}

	export interface CSChatResponseCommand {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
		when?: string;
	}

	export interface CSChatSessionReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;
	}

	export type CSChatWelcomeMessageContent = string | MarkdownString | CSChatSessionReplyFollowup[];

	export interface CSChatSessionProvider<S extends CSChatSession = CSChatSession> {
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<CSChatWelcomeMessageContent[]>;
		provideSampleQuestions?(token: CancellationToken): ProviderResult<CSChatSessionReplyFollowup[]>;
		prepareSession(token: CancellationToken): ProviderResult<S>;
	}

	export interface CSChatSessionDynamicRequest {
		/**
		 * The message that will be displayed in the UI
		 */
		message: string;
	}

	export namespace csChat {
		// current version of the proposal.
		export const _version: 1 | number;

		export function registerCSChatSessionProvider(id: string, provider: CSChatSessionProvider): Disposable;

		export function sendCSChatRequestToProvider(providerId: string, message: CSChatSessionDynamicRequest): void;

		export function registerCSChatEditorSessionProvider(provider: CSChatEditorSessionProvider, metadata?: CSChatEditorSessionProviderMetadata): Disposable;

		export function transferChatSession(session: CSChatSession, toWorkspace: Uri): void;
	}
}
