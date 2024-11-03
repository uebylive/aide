/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum AideAgentMode {
		Edit = 1,
		Chat = 2,
		Plan = 3
	}

	export enum AideAgentScope {
		Selection = 1,
		PinnedContext = 2,
		Codebase = 3
	}

	export interface AideAgentFileReference extends ChatPromptReference {
		readonly id: 'vscode.file';
		readonly value: {
			uri: Uri;
			range: Range;
		};
	}

	// This is a cool looking type, but TypeScript currently doesn't enforce it. But it helps understand
	// the intent for us to use it correctly.
	export type AideAgentPromptReference =
		| AideAgentFileReference
		| (Omit<ChatPromptReference, 'id'> & { id: Exclude<string, 'vscode.file'> });

	export interface AideAgentRequest extends ChatRequest {
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

	export interface AideAgentResponseStream extends ChatResponseStream {
		codeEdit(edits: WorkspaceEdit): void;
		push(part: AideAgentResponsePart): void;
		close(): void;
	}

	export interface AideAgentEventSenderResponse {
		stream: AideAgentResponseStream;
		token: CancellationToken;
	}

	export type AideSessionHandler = (id: string) => void;
	export type AideSessionEventHandler = (event: AideAgentRequest, token: CancellationToken) => ProviderResult<ChatResult | void>;
	export type AideSessionEventSender = (sessionId: string) => Thenable<AideAgentEventSenderResponse | undefined>;

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
