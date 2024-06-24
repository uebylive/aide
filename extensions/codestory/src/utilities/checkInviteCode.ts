/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace } from 'vscode';

// For the moment, we read a harcoded list of invite codes embedded in the codebase
import { inviteCodes } from '../invite-codes';

export function checkInviteCode() {
	const config = workspace.getConfiguration('aide');
	const code = config.get<string>('probeInviteCode');
	if (!code || !inviteCodes.includes(code)) { return false; }
	else { return code; }
}
