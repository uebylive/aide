/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PostHog } from 'posthog-node';
import * as vscode from 'vscode';
import { checkInviteCode } from '../utilities/checkInviteCode';
import { getUserId } from '../utilities/uniqueId';

let postHogClient: PostHog | undefined;
try {
	const codestoryConfiguration = vscode.workspace.getConfiguration('codestory');
	const disableTelemetry = codestoryConfiguration.get('disableTelemetry');
	if (disableTelemetry) {
		postHogClient = undefined;
	} else {
		postHogClient = new PostHog(
			'phc_dKVAmUNwlfHYSIAH1kgnvq3iEw7ovE5YYvGhTyeRlaB',
			{ host: 'https://app.posthog.com' }
		);

		identifyUserWithInviteCode();

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('aide')) {
				identifyUserWithInviteCode();
			}
		});
	}
} catch (err) {

}

function identifyUserWithInviteCode() {
	const code = checkInviteCode();
	if (code && postHogClient) { postHogClient.identify({ distinctId: getUserId(), properties: { inviteCode: code } }); }
}


export default postHogClient;
