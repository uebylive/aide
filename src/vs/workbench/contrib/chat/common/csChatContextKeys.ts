/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_CHAT_EDIT_RESPONSEID_IN_PROGRESS = new RawContextKey<string>('chatEditResponseIdInProgress', '', { type: 'string', description: localize('interactiveEditResponseIdInProgress', "The response ID of the current edit in progress.") });
export const CONTEXT_CHAT_EDIT_CODEBLOCK_NUMBER_IN_PROGRESS = new RawContextKey<number>('chatEditCodeblockNumberInProgress', -1, { type: 'number', description: localize('interactiveEditCodeblockNumberInProgress', "The codeblock number of the current edit in progress.") });
