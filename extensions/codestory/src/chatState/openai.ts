/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI } from 'openai';

const openai = new OpenAI({
	apiKey: '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',
});

export const generateChatCompletion = async (
	messages: OpenAI.Chat.CreateChatCompletionRequestMessage[]
): Promise<OpenAI.Chat.Completions.ChatCompletion.Choice | null> => {
	const completion = await openai.chat.completions.create({
		model: 'gpt-4',
		messages: messages,
		max_tokens: 1000,
		stream: false,
	});
	// for await (const data of completion) {
	// 	if (data === 'completion') {
	// 		return data;
	// 	}
	// }
	if (completion.choices.length !== 0) {
		return completion.choices[0];
	}
	return null;
};
