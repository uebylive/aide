/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_AIDE_CONTROLS_HAS_TEXT = new RawContextKey<boolean>('aideControlsHasText', false, { type: 'boolean', description: localize('aideControlsHasText', "True when the AI controls input has text.") });
export const CONTEXT_AIDE_CONTROLS_HAS_FOCUS = new RawContextKey<boolean>('aideControlsHasFocus', false, { type: 'boolean', description: localize('aideControlsHasFocus', "True when the AI controls input has focus.") });
