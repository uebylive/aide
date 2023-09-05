/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { v4 as uuidv4 } from 'uuid';
import { commands, env } from 'vscode';
import { EmbeddingsSearch } from '../codeGraph/embeddingsSearch';
import { CodeGraph } from '../codeGraph/graph';
import { TSMorphProjectManagement } from '../utilities/parseTypescript';
import { MessageHandlerData } from '@estruyf/vscode';
import { debuggingFlow } from '../llm/recipe/debugging';
import { ToolingEventCollection } from '../timeline/events/collection';
import logger from '../logger';
import { PromptState } from '../types';
import { PythonServer } from '../utilities/pythonServerClient';
import postHogClient from '../posthog/client';
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { GoLangParser } from '../languages/goCodeSymbols';
import { CSChatProvider } from '../providers/chatprovider';

export const debug = (
	csChatProvider: CSChatProvider,
	embeddingIndex: EmbeddingsSearch,
	tsMorphProjectManagement: TSMorphProjectManagement,
	pythonServer: PythonServer,
	goLangParser: GoLangParser,
	codeGraph: CodeGraph,
	repoName: string,
	repoHash: string,
	workingDirectory: string,
	testSuiteRunCommand: string,
	activeFilesTracker: ActiveFilesTracker,
) => {
	const uniqueId = uuidv4();
	return commands.registerCommand(
		'codestory.debug',
		async ({ payload, ...message }: MessageHandlerData<PromptState>) => {
			logger.info('[CodeStory] Debugging');
			logger.info(payload);
			const toolingEventCollection = new ToolingEventCollection(
				`/tmp/${uniqueId}`,
				codeGraph,
				undefined,
				message.command,
			);
			try {
				postHogClient.capture({
					distinctId: env.machineId,
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
					codeGraph,
					embeddingIndex,
					tsMorphProjectManagement,
					pythonServer,
					goLangParser,
					workingDirectory,
					testSuiteRunCommand,
					activeFilesTracker,
					undefined,
					uniqueId,
				);
			} catch (e) {
				logger.info('[CodeStory] Debugging failed');
				logger.error(e);
			}
		}
	);
};
