/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_AST_NAVIGATION_MODE = new RawContextKey<boolean>('astNavigationMode', true, { type: 'boolean', description: 'AST Navigation Mode' });
