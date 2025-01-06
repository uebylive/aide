/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';

export const RAGESHAKE_CARD_VISIBLE = new RawContextKey<boolean>('csRageShakeCardVisible', false, { type: 'boolean', description: localize('csRageShakeCardVisible', "Whether the CodeStory rage shake card is visible") });
