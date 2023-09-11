/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import axios from 'axios';
import { MessageHandlerData } from '@estruyf/vscode';
import { ExtensionContext, OutputChannel, commands, env } from 'vscode';

import { CodeStoryViewProvider } from '../providers/codeStoryView';
import postHogClient from '../posthog/client';
import { HealthState } from '../types';

export const healthCheck = (
	context: ExtensionContext,
	provider: CodeStoryViewProvider,
	repoName: string,
	repoHash: string,
	uniqueUserId: string,
) => {
	return commands.registerCommand(
		'codestory.healthCheck',
		async (message: MessageHandlerData<HealthState>) => {
			postHogClient.capture({
				distinctId: uniqueUserId,
				event: 'health_check',
				properties: {
					repoName,
					repoHash,
				},
			});
			const health: HealthState = { status: 'OK' };
			const response: MessageHandlerData<HealthState> = {
				...message,
				payload: { status: health.status },
			};
			provider.getView()?.webview.postMessage(response);
		}
	);
};
