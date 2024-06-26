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
	}

	export interface ProbeResponseStream {
		markdown(value: string | MarkdownString): void;
		breakdown(value: AideChatResponseBreakdown): void;
		location(value: AideProbeGoToDefinition): void;
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
