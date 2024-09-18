/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface AgentTrigger {
		id: string;
		message: string;
	}

	export interface AgentResponseStream {
		markdown(value: string | MarkdownString): void;
	}

	export interface AgentTriggerComplete {
		errorDetails?: string;
	}

	export interface AideAgentProvider {
		provideTriggerResponse(request: AgentTrigger, response: AgentResponseStream, token: CancellationToken): ProviderResult<AgentTriggerComplete | void>;
	}

	export namespace aideAgent {
		export function registerAideAgentProvider(id: string, provider: AideAgentProvider): Disposable;
	}
}
