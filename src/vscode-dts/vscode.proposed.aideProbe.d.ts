/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	export type AideProbeMode = 'EXPLORE' | 'AGENTIC' | 'ANCHORED' | 'FOLLOW_UP';

	export interface FollowAlongAction {
		type: 'followAlong';
		status: boolean;
	}

	export interface NavigateBreakdownAction {
		type: 'navigateBreakdown';
		status: boolean;
	}

	export interface NewIterationAction {
		type: 'newIteration';
		newPrompt: string;
	}

	interface ChatContentVariableReference {
		variableName: string;
		value?: Uri | Location;
	}

	interface AideChatContentReference {
		reference: Uri | Location | ChatContentVariableReference;
		iconPath?: ThemeIcon | { light: Uri; dark?: Uri };
		kind: 'reference';
	}

	export interface ContextChangedAction {
		type: 'contextChange';
		newContext: string[];
	}

	export interface FollowUpRequestAction {
		type: 'followUpRequest';
	}

	export interface AideProbeSessionAction {
		sessionId: string;
		action: FollowAlongAction | NavigateBreakdownAction | NewIterationAction | ContextChangedAction | FollowUpRequestAction | AnchorSessionStart;
	}

	export interface AnchorSessionStart {
		type: 'anchorSessionStart';
		status: boolean;
	}

	export type AideProbeUserAction = ContextChangedAction;

	export interface ProbeRequest {
		requestId: string;
		query: string;
		readonly references: readonly ChatPromptReference[];
		mode: AideProbeMode;
		codebaseSearch: boolean;
	}

	export interface AideProbeGoToDefinition {
		/**
		 * The file where the agent went to the definition.
		 */
		readonly uri: Uri;

		/**
		 * Name of the symbol
		 */
		readonly name: string;

		/**
		 * The position of the symbol where the agent went to definition.
		 */
		readonly range: Range;

		/**
		 * The thinking process behind following this definition
		 */
		readonly thinking: string;
	}

	export interface AideProbeResponseTextEdit {
		/**
		 * Where edits will be applied
		 */
		readonly iterationId: string;
		readonly edits: WorkspaceEdit;
	}

	export interface AideProbeIterationFinished {
		readonly edits: WorkspaceEdit;
	}

	/**
	 * This event is required to add the edits to the undo stack
	 * This is always required if we are streaming since streamed edits
	 * do not get stored on the undo stack
	 *
	 * When applying edits directly we do not need to do this
	 */
	export interface AideProbeAddEditToUndoStack {
		readonly edits: WorkspaceEdit;
	}


	export interface AideInitialSearchSymbolInformation {
		readonly symbolName: string;
		readonly uri: Uri;
		readonly isNew: boolean;
		readonly thinking: string;
	}

	export interface ProbeResponseStream {
		markdown(value: string | MarkdownString): void;
		repoMapGeneration(value: boolean): void;
		longContextSearch(value: boolean): void;
		codeIterationFinished(value: AideProbeIterationFinished): void;
		initialSearchSymbols(value: AideInitialSearchSymbolInformation[]): void;
		breakdown(value: AideChatResponseBreakdown): void;
		openFile(value: AideProbeResponseOpenFile): void;
		location(value: AideProbeGoToDefinition): void;
		codeEdit(value: AideProbeResponseTextEdit): Thenable<void>;
	}

	export interface ProbeErrorDetails {
		message: string;
	}

	export interface ProbeResult {
		iterationEdits?: WorkspaceEdit;
		errorDetails?: ProbeErrorDetails;
	}

	export interface ProbeResponseHandler {
		provideProbeResponse(request: ProbeRequest, response: ProbeResponseStream, token: CancellationToken): ProviderResult<ProbeResult | void>;
		onDidSessionAction: (action: AideProbeSessionAction) => ProviderResult<void>;
		onDidUserAction(action: AideProbeUserAction): ProviderResult<void>;
	}

	export namespace aideProbe {
		export const _version: 1 | number;

		/**
		 * Register a LLM as chat response provider to the editor.
		 *
		 *
		 * @param id
		 * @param provider
		 * @param metadata
		 */
		export function registerProbeResponseProvider(id: string, provider: ProbeResponseHandler): Disposable;
	}
}
