/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_PROBE_MODE = new RawContextKey<'explore' | 'edit'>('aideProbeMode', 'explore', { type: 'string', description: localize('aideProbeMode', "Either explore or edit") });
export const CONTEXT_PROBE_INPUT_HAS_TEXT = new RawContextKey<boolean>('aideProbeInputHasText', false, { type: 'boolean', description: localize('aideProbeInputHasText', "True when the AI search input has text.") });
export const CONTEXT_PROBE_INPUT_HAS_FOCUS = new RawContextKey<boolean>('aideProbeInputHasFocus', false, { type: 'boolean', description: localize('aideProbeInputHasFocus', "True when the AI search input has focus.") });
export const CONTEXT_PROBE_REQUEST_IN_PROGRESS = new RawContextKey<boolean>('aideProbeRequestInProgress', false, { type: 'boolean', description: localize('aideProbeRequestInProgress', "True when the AI search request is in progress.") });
export const CONTEXT_PROBE_IS_ACTIVE = new RawContextKey<boolean>('aideProbeRequestIsActive', false, { type: 'boolean', description: localize('aideProbeRequestIsActive', "True when the AI search request is active") });
export const CONTEXT_IN_PROBE_INPUT = new RawContextKey<boolean>('inAideProbeInput', false, { type: 'boolean', description: localize('inAideProbeInput', "True when focus is in the AI search input, false otherwise.") });
