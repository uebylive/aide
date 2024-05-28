/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_AIDE_CHAT_INPUT_HAS_TEXT = new RawContextKey<boolean>('aideChatInputHasText', false, { type: 'boolean', description: localize('aideChatInputHasText', "True when the Aide chat input has text.") });
export const CONTEXT_AIDE_CHAT_INPUT_HAS_FOCUS = new RawContextKey<boolean>('aideChatInputHasFocus', false, { type: 'boolean', description: localize('aideChatInputHasFocus', "True when the Aide chat input has focus.") });
export const CONTEXT_IN_AIDE_CHAT_INPUT = new RawContextKey<boolean>('inAideChatInput', false, { type: 'boolean', description: localize('inAideChatInput', "True when focus is in the Aide chat input, false otherwise.") });

export const CONTEXT_AIDE_CHAT_INPUT_CURSOR_AT_TOP = new RawContextKey<boolean>('aideChatCursorAtTop', false);
