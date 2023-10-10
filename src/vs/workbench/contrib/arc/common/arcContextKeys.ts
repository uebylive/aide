/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const ARC_PROVIDER_EXISTS = new RawContextKey<boolean>('hasArcProvider', false, { type: 'boolean', description: localize('hasArcProvider', "True when some arc provider has been registered.") });
export const ARC_VIEW_VISIBLE = new RawContextKey<boolean>('inArcView', false, { type: 'boolean', description: localize('inArcView', "True arc view is visible, false otherwise.") });
