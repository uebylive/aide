/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum AideAgentMode {
		Edit = 1,
		Chat = 2
	}

	export interface AideAgentRequest extends ChatRequest {
		id: string;
		mode: AideAgentMode;
	}

	export interface AideAgentResponseStream extends ChatResponseStream {
		close(): void;
	}

	export type AideSessionHandler = (id: string) => void;
	export type AideSessionEventHandler = (event: AideAgentRequest, token: CancellationToken) => ProviderResult<ChatResult | void>;
	export type AideSessionEventSender = (sessionId: string) => Thenable<AideAgentResponseStream | undefined>;

	export interface AideSessionParticipant {
		newSession: AideSessionHandler;
		handleEvent: AideSessionEventHandler;
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
