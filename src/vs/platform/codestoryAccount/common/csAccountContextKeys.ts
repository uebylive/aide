/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CS_ACCOUNT_CARD_VISIBLE = new RawContextKey<boolean>('csAccountCardVisible', false, { type: 'boolean', description: localize('csAccountCardVisible', "Whether the CodeStory account card is visible") });

