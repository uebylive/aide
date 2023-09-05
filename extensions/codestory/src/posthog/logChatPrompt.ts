/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from 'vscode';
import postHogClient from './client';


export const logChatPrompt = (
	prompt: string,
	githubRepoName: string,
	githubRepoHash: string,
) => {
	postHogClient.capture({
		distinctId: env.machineId,
		event: 'chat_message',
		properties: {
			prompt,
			githubRepoName,
			githubRepoHash,
		},
	});
};
