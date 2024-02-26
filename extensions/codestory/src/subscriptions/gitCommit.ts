/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Module to power git commits and help make that happen
// from the extension
import { MessageHandlerData } from '@estruyf/vscode';
import { ExtensionContext, OutputChannel, commands, env, window } from 'vscode';
import { Logger } from 'winston';
import postHogClient from '../posthog/client';
import { GitCommitRequest } from '../types';

const CODESTORY_GENERATED_MESSAGE = 'CodeStory generated commit message';


export const gitCommit = (
	logger: Logger,
	repoName: string,
	repoHash: string,
	uniqueUserId: string,
) => {
	return commands.registerCommand(
		'codestory.gitCommit',
		async ({ payload, ...message }: MessageHandlerData<GitCommitRequest>) => {
			postHogClient?.capture({
				distinctId: uniqueUserId,
				event: 'git_commit',
				properties: {
					repoName,
					repoHash,
				},
			});
			logger.info(`[CodeStory] Git commit request: ${JSON.stringify(payload)}`);
			let terminal = window.activeTerminal;

			if (!terminal) {
				logger.info(`[CodeStory] No active terminal found. Creating new terminal.`);
				terminal = window.createTerminal('[CodeStory] git commit');
				terminal?.show(true);
			}

			logger.info(`[CodeStory] Git commit terminal: ${terminal.name}`);

			const fileList = payload.files.join(' ');

			terminal.sendText(`git add ${fileList}`, true);
			terminal.sendText(`git commit -m '${payload.message}'`, true);

			// log information to output channel
			logger.info(`[CodeStory] Added files: ${fileList}`);
			logger.info(`[CodeStory] Commit message: '${payload.message}\/n/n/${CODESTORY_GENERATED_MESSAGE}'`);
		});
};
