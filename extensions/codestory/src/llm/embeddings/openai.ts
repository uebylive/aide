/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OpenAI } from 'openai';

const openai = new OpenAI({
	apiKey: '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',
});

export const generateEmbedding = async (prompt: string): Promise<number[]> => {
	const response = await openai.embeddings.create({
		model: 'text-embedding-ada-002',
		input: prompt,
	});
	const [{ embedding }] = response.data;
	return embedding;
};
