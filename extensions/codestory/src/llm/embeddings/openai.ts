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
// 	const features = await generateEmbedding(textToEmbed);
// 	console.log(features);
// })();
