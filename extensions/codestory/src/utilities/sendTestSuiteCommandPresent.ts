/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// We want to send this information to the frontend if the test suite command
// is present, if its not then we can show it as disabled on the UI

import { AgentViewProvider } from '../providers/AgentView';
import { sleep } from './sleep';


export const sendTestSuiteRunCommand = async (testSuiteRunCommand: string | undefined, provider: AgentViewProvider) => {
	let webView = provider.getView();
	while (!webView) {
		// TODO(codestory): This is a hack here, we should not be lazy sleeping
		// figure out the right API to make this work.
		await sleep(200);
		webView = provider.getView();
	}
	const value = await provider.getView()?.webview.postMessage({
		payload: {
			testSuiteRunCommand: testSuiteRunCommand,
		},
		command: 'testSuiteRunCommand',
	});
	console.log('We are sending the request to the webview' + value);
};
