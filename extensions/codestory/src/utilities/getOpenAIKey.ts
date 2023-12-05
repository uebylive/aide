/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';

export const getOpenAIApiKey = (): string | null => {
	const codestoryConfiguration = vscode.workspace.getConfiguration('codestory');
	const openAIApiKey = codestoryConfiguration.get('openAIApiKey');
	if (openAIApiKey === undefined) {
		return null;
	}
	if (openAIApiKey === '') {
		return null;
	}
	if (typeof openAIApiKey === 'string') {
		if (openAIApiKey === 'NOT_SET') {
			return null;
		} else {
			return openAIApiKey;
		}
	}
	return null;
};
