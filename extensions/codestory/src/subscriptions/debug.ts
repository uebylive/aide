/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { v4 as uuidv4 } from 'uuid';
import { commands } from 'vscode';
import { MessageHandlerData } from '@estruyf/vscode';

import { debuggingFlow } from '../llm/recipe/debugging';
import { ToolingEventCollection } from '../timeline/events/collection';
import logger from '../logger';
import { PromptState } from '../types';
import postHogClient from '../posthog/client';
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { RepoRef, SideCarClient } from '../sidecar/client';

export const debug = (
	codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
	sidecarClient: SideCarClient,
	repoName: string,
	repoHash: string,
	workingDirectory: string,
	testSuiteRunCommand: string,
	activeFilesTracker: ActiveFilesTracker,
	uniqueUserId: string,
	agentCustomInstruction: string | null,
	reporef: RepoRef,
) => {
	const uniqueId = uuidv4();
	return commands.registerCommand(
		'codestory.debug',
		async ({ payload, ...message }: MessageHandlerData<PromptState>) => {
			logger.info('[CodeStory] Debugging');
			logger.info(payload);
			const toolingEventCollection = new ToolingEventCollection(
				`/tmp/${uniqueId}`,
				undefined,
				message.command,
			);
			try {
				postHogClient?.capture({
					distinctId: uniqueUserId,
					event: 'debug_prompt_received',
					properties: {
						prompt: payload.prompt,
						repoName,
						repoHash,
					},
				});
				await debuggingFlow(
					payload.prompt,
					toolingEventCollection,
					sidecarClient,
					codeSymbolsLanguageCollection,
					workingDirectory,
					testSuiteRunCommand,
					activeFilesTracker,
					uniqueId,
					agentCustomInstruction,
					reporef,
				);
			} catch (e) {
				logger.info('[CodeStory] Debugging failed');
				logger.error(e);
			}
		}
	);
};
