/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface FollowAlongAction {
		type: 'followAlong';
		status: boolean;
	}

	export interface NavigateBreakdownAction {
		type: 'navigateBreakdown';
		status: boolean;
	}

	export interface AideProbeUserAction {
		sessionId: string;
		action: FollowAlongAction | NavigateBreakdownAction;
	}

	export interface ProbeRequest {
		requestId: string;
		query: string;
		editMode: boolean;
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

	export interface AideProbeResponseTextEditPreview {
		/**
		 * Code reference relevant to this breakdown.
		*/
		readonly reference: CodeReferenceByName;

		/**
		 * Where edits will be applied
		 */
		readonly range: Range;
	}

	export interface AideProbeResponseTextEdit {
		/**
		 * Where edits will be applied
		 */
		readonly edits: WorkspaceEdit;
	}

	export interface ProbeResponseStream {
		markdown(value: string | MarkdownString): void;
		breakdown(value: AideChatResponseBreakdown): void;
		location(value: AideProbeGoToDefinition): void;
		codeEditPreview(value: AideProbeResponseTextEditPreview): void;
		codeEdit(value: AideProbeResponseTextEdit): Thenable<void>;
	}

	export interface ProbeErrorDetails {
		message: string;
	}

	export interface ProbeResult {
		errorDetails?: ProbeErrorDetails;
	}

	export interface ProbeResponseHandler {
		provideProbeResponse(request: ProbeRequest, response: ProbeResponseStream, token: CancellationToken): ProviderResult<ProbeResult | void>;
		onDidUserAction: (action: AideProbeUserAction) => void;
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
