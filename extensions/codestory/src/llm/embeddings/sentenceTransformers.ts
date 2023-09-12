/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

let embeddingModel: Promise<any> | undefined;

// import * as transformers from '@xenova/transformers';

async function getEmbeddingModel(): Promise<any> {
	if (!embeddingModel) {
		embeddingModel = (async () => {
			const TransformersApi = Function('return import("@xenova/transformers")')();
			const { pipeline, env } = await TransformersApi;
			const modelPath = path.join(__dirname, 'models');
			env.localModelPath = modelPath;
			env.allowRemoteModels = false;
			const pipe = await pipeline('embeddings', 'sentence-transformers/all-MiniLM-L6-v2', {
				quantized: false,
			});
			return {
				pipe,
			};
		})();
		return embeddingModel;
	}
	return embeddingModel;
}

export const generateEmbeddingFromSentenceTransformers = async (prompt: string): Promise<number[]> => {
	const { pipe } = await getEmbeddingModel();
	const output = await pipe(prompt, {
		pooling: 'mean',
		normalize: true,
	});
	return Array.from(output.data); // of shape [1, 384]
};


// void (async () => {
// 	const features = await generateEmbeddingFromSentenceTransformers('this is text');
// 	console.log(features);
// })();
