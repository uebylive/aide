/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_COMMAND_PALETTE_INPUT_HAS_FOCUS = new RawContextKey<boolean>('aideCommandPaletteHasFocus', false, { type: 'boolean', description: localize('aideCommandPaletteHasFocus', "True when the command palette input has focus.") });
