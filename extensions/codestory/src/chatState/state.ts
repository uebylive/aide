/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	ChatCompletionRequestMessage,
	ChatCompletionRequestMessageRoleEnum,
	ChatCompletionResponseMessage,
	Configuration,
	CreateChatCompletionResponseChoicesInner,
	OpenAIApi,
} from 'openai';


const chatSystemPrompt = (): string => {
	return 'Your name is CodeStory bot. You are a brilliant and meticulous engineer assigned to write code for the following Github issue. When you write code, the code works on the first try and is formatted perfectly. You have the utmost care for the code that you write, so you do not make mistakes. Take into account the current repository\'s language, frameworks, and dependencies.';
};


export class CSChatState {
	private _messages: ChatCompletionRequestMessage[];

	constructor() {
		this._messages = [];
		this.addSystemPrompt();
	}

	getMessageLength(): number {
		return this._messages.length;
	}

	addSystemPrompt(): void {
		this._messages.push({
			role: ChatCompletionRequestMessageRoleEnum.System,
			content: chatSystemPrompt(),
		});
	}

	addUserMessage(message: string): void {
		this._messages.push({
			role: ChatCompletionRequestMessageRoleEnum.User,
			content: message,
		});
	}

	addCodeStoryMessage(message: string): void {
		this._messages.push({
			role: ChatCompletionRequestMessageRoleEnum.Assistant,
			content: message,
		});
	}
}
