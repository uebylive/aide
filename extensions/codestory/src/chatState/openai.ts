/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatCompletionRequestMessage, Configuration, CreateChatCompletionResponseChoicesInner, OpenAIApi } from 'openai';

const configuration = new Configuration({
	apiKey: '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',
});
const openai = new OpenAIApi(configuration);

export const generateChatCompletion = async (
	messages: ChatCompletionRequestMessage[]
): Promise<CreateChatCompletionResponseChoicesInner | null> => {
	const { data } = await openai.createChatCompletion({
		model: 'gpt-4',
		messages: messages,
		max_tokens: 1000,
	});
	if (data.choices.length !== 0) {
		return data.choices[0];
	}
	return null;
};
