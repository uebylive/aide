/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';

const openai = new OpenAI({
	apiKey: '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',
});

export const generateChatCompletion = async (
	messages: OpenAI.Chat.CreateChatCompletionRequestMessage[]
): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk> | null> => {
	const completion: Stream<OpenAI.Chat.Completions.ChatCompletionChunk> = await openai.chat.completions.create({
		model: 'gpt-4',
		messages: messages,
		max_tokens: 1000,
		stream: true,
	});
	return completion;
};
