/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { pipeline, env } from './src2/transformers';

let embeddingModel: Promise<any> | undefined;


export async function getEmbeddingModel(): Promise<any> {
	if (!embeddingModel) {
		embeddingModel = (async () => {
			console.log('[getEmbeddingModel] env');
			console.log(env);
			env.backends.onnx.wasm.numThreads = 3;
			const modelPath = path.join(__dirname, 'models');
			env.localModelPath = modelPath;
			env.allowRemoteModels = false;
			const pipe = await pipeline('embeddings', 'sentence-transformers/all-MiniLM-L6-v2', {
				quantized: true,
			});
			return {
				pipe,
			};
		})();
		return embeddingModel;
	}
	return embeddingModel;
}

function sleepWithJitter(baseDelay: number, jitterAmount: number) {
	const delay = baseDelay + Math.floor(Math.random() * jitterAmount);
	return new Promise(resolve => setTimeout(resolve, delay));
}

const cleanupString = (prompt: string): string => {
	// We are going to remove the last line if it contains `sourceMappingURL=data:application/json;base64`
	if (prompt.includes('sourceMappingURL=data:application/json;base64')) {
		return prompt.split('\n').slice(0, -1).join('\n');
	} else {
		return prompt;
	}
};

export const generateEmbeddingFromSentenceTransformers = async (prompt: string, context: string): Promise<number[]> => {
	prompt = cleanupString(prompt);
	try {
		const { pipe } = await getEmbeddingModel();
		// Put 40ms + rand * 20ms sleep to give the model a bit of breathing space
		// we need better backoff strategies here, not sure why its getting stuck
		// tbh
		await sleepWithJitter(50, 20);
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
// 	const textToEmbed = `
// 	const configPath = await generateVSCodeConfigurationTask();
//     if (!configPath) {
//         return;
//     }
//     const settingsSearchBuildId = getSettingsSearchBuildId(packageJson);
//     if (!settingsSearchBuildId) {
//         throw new Error('Failed to compute build number');
//     }
//     const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
//     return new Promise((c, e) => {
//         vfs.src(configPath)
//             .pipe(azure.upload({
//             account: process.env.AZURE_STORAGE_ACCOUNT,
//             credential,
//             container: 'configuration',
//             prefix: \`\${settingsSearchBuildId}/\${commit}/\`
//         }))
//             .on('end', () => c())
//             .on('error', (err) => e(err));
//     });
// }
// if (require.main === module) {
//     main().catch(err => {
//         console.error(err);
//         process.exit(1);
//     });
// }
// `;
// 	const features = await generateEmbeddingFromSentenceTransformers(textToEmbed, 'something');
// 	console.log(features);
// })();
