/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OpenAI } from 'openai';
import { getOpenAIApiKey } from '../../utilities/getOpenAIKey';

const openai = new OpenAI({
	apiKey: getOpenAIApiKey(),
});

export const generateEmbedding = async (prompt: string): Promise<number[]> => {
	try {
		const response = await openai.embeddings.create({
			model: 'text-embedding-ada-002',
			input: prompt,
		});
		const [{ embedding }] = response.data;
		return embedding;
	} catch (error) {
		return Array(1536).fill(0);
	}
};
