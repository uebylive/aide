/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { DevtoolsStatus } from './devtoolsService.js';

export const CONTEXT_IS_DEVTOOLS_FEATURE_ENABLED = new RawContextKey<boolean>('isFeatureEnabled', false, { type: 'boolean', description: localize('isFeatureEnabled', "True when the opt-in devtools feature is enabled, false otherwise") });
export const CONTEXT_IS_INSPECTING_HOST = new RawContextKey<boolean>('isInspectingHost', false, { type: 'boolean', description: localize('isInspectingHost', "True when the devtools are inspecting the host, false otherwise") });
export const CONTEXT_DEVTOOLS_STATUS = new RawContextKey<DevtoolsStatus>('inAideAgentInput', DevtoolsStatus.Idle, { type: 'string', description: localize('devtoolsStatus', "The status of the devtools") });
