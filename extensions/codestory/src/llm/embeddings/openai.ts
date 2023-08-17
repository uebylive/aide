/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
	apiKey: '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',
});
const openai = new OpenAIApi(configuration);

export const generateEmbedding = async (prompt: string): Promise<number[]> => {
	const response = await openai.createEmbedding({
		model: 'text-embedding-ada-002',
		input: prompt,
	});
	const [{ embedding }] = response.data.data;
	return embedding;
};
