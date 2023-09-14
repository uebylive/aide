/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

let embeddingModel: Promise<any> | undefined;

import("@xenova/transformers")


export async function getEmbeddingModel(): Promise<any> {
	if (!embeddingModel) {
		embeddingModel = (async () => {
			const TransformersApi = Function('return import("@xenova/transformers")')();
			const { pipeline, env } = await TransformersApi;
			// Lets increase the number of threads for onnx runtime and check if
			// that works
			console.log('[getEmbeddingModel] env');
			console.log(env);
			env.backends.onnx.wasm.numThreads = 3;
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

export const generateEmbeddingFromSentenceTransformers = async (prompt: string, context: string): Promise<number[]> => {
	console.log(`[generateEmbeddingsFromSentenceTransformers][${context}] ${prompt}`);
	const { pipe } = await getEmbeddingModel();
	try {
		const output = await pipe(prompt, {
			pooling: 'mean',
			normalize: true,
		});
		return Array.from(output.data); // of shape [1, 384]
	} catch (e) {
		console.log('[generateEmbeddingsFromSentenceTransformers] error');
		console.error(e);
		// return an error of 0s of length 384
		return Array(384).fill(0);
	}
};


// void (async () => {
// 	const features = await generateEmbeddingFromSentenceTransformers('this is text');
// 	console.log(features);
// })();
