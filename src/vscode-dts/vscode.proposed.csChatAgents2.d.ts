/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export type CSChatAgentExtendedHandler = (request: CSChatAgentRequest, context: ChatAgentContext, progress: Progress<ChatAgentExtendedProgress>, token: CancellationToken) => ProviderResult<ChatAgentResult2>;

	export interface CSChatAgentRequest {
		threadId: string;

		/**
		 * The prompt entered by the user. The {@link ChatAgent2.name name} of the agent or the {@link ChatAgentSlashCommand.name slash command}
		 * are not part of the prompt.
		 *
		 * @see {@link ChatAgentRequest.slashCommand}
		 */
		prompt: string;

		/**
		 * The {@link ChatAgentSlashCommand slash command} that was selected for this request. It is guaranteed that the passed slash
		 * command is an instance that was previously returned from the {@link ChatAgentSlashCommandProvider.provideSlashCommands slash command provider}.
		 */
		slashCommand?: ChatAgentSlashCommand;

		variables: Record<string, CSChatVariableValue[]>;
	}
}
