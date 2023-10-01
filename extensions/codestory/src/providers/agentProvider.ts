/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ChatAgent, ChatAgentCommand, ChatAgentContext, ChatAgentMetadata, ChatAgentResponse, ChatAgentResult, ChatMessage, InteractiveProgressFileTree, InteractiveSessionFollowup, MarkdownString, Progress, Uri } from 'vscode';

class CSAgentContext implements ChatAgentContext {
	history: ChatMessage[];

	constructor(history: ChatMessage[]) {
		this.history = history;
	}
}

class CSAgentResponse implements ChatAgentResponse {
	message: MarkdownString | InteractiveProgressFileTree;

	constructor(message: MarkdownString | InteractiveProgressFileTree) {
		this.message = message;
	}
}

class CSAgentResult implements ChatAgentResult {
	followUp?: InteractiveSessionFollowup[];

	constructor(followUp?: InteractiveSessionFollowup[]) {
		this.followUp = followUp;
	}
}

class CSAgentCommand implements ChatAgentCommand {
	name: string;
	description: string;

	constructor(name: string, description: string) {
		this.name = name;
		this.description = description;
	}
}

export class CSAgentMetadata implements ChatAgentMetadata {
	description: string;
	fullName?: string;
	icon?: Uri;
	subCommands: CSAgentCommand[];

	constructor(description: string, fullName?: string, icon?: Uri, subCommands: CSAgentCommand[] = []) {
		this.description = description;
		this.fullName = fullName;
		this.icon = icon;
		this.subCommands = subCommands;
	}
}

export class CSAgentProvider {
	provideAgentResponse(
		prompt: ChatMessage,
		context: CSAgentContext,
		progress: Progress<CSAgentResponse>,
		token: CancellationToken
	): Promise<CSAgentResult | void> {
		// Simulate some progress:
		progress.report(new CSAgentResponse(new MarkdownString('Processing chat message...')));

		// Simulate processing the chat message:
		const processedMessage = `Processed: ${prompt.content}`;

		progress.report(new CSAgentResponse(new MarkdownString(processedMessage)));

		return Promise.resolve(new CSAgentResult());
	}
}
