
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
		Accepted = 3
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
	}

	export interface CSChatEditorSessionProviderMetadata {
		label: string;
	}

	export interface CSChatEditorSessionProvider<S extends CSChatEditorSession = CSChatEditorSession, R extends CSChatEditorResponse | CSChatEditorMessageResponse = CSChatEditorResponse | CSChatEditorMessageResponse> {

		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareCSChatEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<S>;

		provideCSChatEditorResponse(session: S, request: CSChatEditorRequest, progress: Progress<CSChatEditorProgressItem>, token: CancellationToken): ProviderResult<R>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleCSChatEditorResponseFeedback?(session: S, response: R, kind: CSChatEditorResponseFeedbackKind): void;
	}


	export interface CSChatSessionState { }

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

		saveState?(): CSChatSessionState;
	}

	export interface CSChatSessionRequestArgs {
		command: string;
		args: any;
	}

	export interface InteractiveChatCodeSymbolContext {
		filePath: string;
		startLineNumber: number;
		endLineNumber: number;
		documentSymbolName: string;
	}


	export interface InteractiveUserProvidedContext {
		fileContext: string[];
		codeSymbolsContext: InteractiveChatCodeSymbolContext[];
	}

	export interface CSChatRequest {
		session: CSChatSession;
		message: string;
		userProvidedContext: InteractiveProvidedContext | undefined;
	}

	export interface CSChatResponseErrorDetails {
		message: string;
		responseIsIncomplete?: boolean;
		responseIsFiltered?: boolean;
	}

	export interface CSChatResponseForProgress {
		errorDetails?: CSChatResponseErrorDetails;
	}

	export interface CSChatContentReference {
		reference: Uri | Location;
	}

	export interface CSChatInlineContentReference {
		inlineReference: Uri | Location;
		title?: string; // eg symbol name
	}

	export interface CSChatProgressContent {
		content: string | MarkdownString;
	}

	export interface CSChatProgressId {
		responseId: string;
	}

	export interface CSChatProgressTask {
		placeholder: string;
		resolvedContent: Thenable<CSChatProgressContent | CSChatProgressFileTree>;
	}

	export interface FileTreeData {
		label: string;
		uri: Uri;
		children?: FileTreeData[];
	}

	export interface CSChatProgressFileTree {
		treeData: FileTreeData;
	}

	export interface DocumentContext {
		uri: Uri;
		version: number;
		ranges: Range[];
	}

	export interface CSChatProgressUsedContext {
		documents: DocumentContext[];
	}

	export type CSChatProgress =
		| CSChatProgressContent
		| CSChatProgressId
		| CSChatProgressTask
		| CSChatProgressFileTree
		| CSChatProgressUsedContext
		| CSChatContentReference
		| CSChatInlineContentReference;

	export interface CSChatResponseCommand {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
		when?: string;
	}

	export interface CSChatSessionSlashCommand {
		command: string;
		kind: CompletionItemKind;
		detail?: string;
		shouldRepopulate?: boolean;
		followupPlaceholder?: string;
		executeImmediately?: boolean;
		yieldTo?: ReadonlyArray<{ readonly command: string }>;
	}

	export interface CSChatSessionReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;

		// Extensions can put any serializable data here, such as an ID/version
		metadata?: any;
	}

	// todo@API make classes
	export interface CSChatEditResponse {
		edits: WorkspaceEdit;
		placeholder?: string;
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface CSChatMessageResponse {
		contents: MarkdownString;
		placeholder?: string;
		wholeRange?: Range;
	}

	export interface CSChatEditProgressItem {
		message?: string;
		edits?: WorkspaceEdit;
		editsShouldBeInstant?: boolean;
		content?: string | MarkdownString;
	}

	export interface CSChatCodeBlockInfo {
		index: number;
		code: string;
	}

	export type CSChatSessionFollowup = CSChatSessionReplyFollowup | CSChatResponseCommand;

	export type CSChatWelcomeMessageContent = string | MarkdownString | CSChatSessionReplyFollowup[];

	export interface CSChatSessionProvider<S extends CSChatSession = CSChatSession, R extends CSChatEditResponse | CSChatMessageResponse = CSChatEditResponse | CSChatMessageResponse> {
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<CSChatWelcomeMessageContent[]>;
		provideSampleQuestions?(token: CancellationToken): ProviderResult<CSChatSessionReplyFollowup[]>;
		provideFollowups?(session: S, token: CancellationToken): ProviderResult<(string | CSChatSessionFollowup)[]>;
		provideSlashCommands?(session: S, token: CancellationToken): ProviderResult<CSChatSessionSlashCommand[]>;

		prepareSession(initialState: CSChatSessionState | undefined, token: CancellationToken): ProviderResult<S>;
		provideResponseWithProgress(request: CSChatRequest, progress: Progress<CSChatProgress>, token: CancellationToken): ProviderResult<CSChatResponseForProgress>;
		provideEditsWithProgress(session: S, requestId: string, responseId: string, codeblocks: CSChatCodeBlockInfo[], progress: Progress<CSChatEditProgressItem>, token: CancellationToken): ProviderResult<R>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		removeRequest(session: S, requestId: string): void;
	}

	export interface CSChatSessionDynamicRequest {
		/**
		 * The message that will be displayed in the UI
		 */
		message: string;

		/**
		 * Any extra metadata/context that will go to the provider.
		 * NOTE not actually used yet.
		 */
		metadata?: any;
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
