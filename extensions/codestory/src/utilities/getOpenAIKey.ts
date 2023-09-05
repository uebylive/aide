/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';


const OPENAI_API_KEY = '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';

export const getOpenAIApiKey = (): string => {
	const codestoryConfiguration = vscode.workspace.getConfiguration('codestory');
	const openAIApiKey = codestoryConfiguration.get('openAIApiKey');
	if (openAIApiKey === undefined) {
		return OPENAI_API_KEY;
	}
	if (openAIApiKey === '') {
		return OPENAI_API_KEY;
	}
	if (typeof openAIApiKey === 'string') {
		if (openAIApiKey === 'NOT_SET') {
			return OPENAI_API_KEY;
		} else {
			return openAIApiKey;
		}
	}
	return OPENAI_API_KEY;
};
