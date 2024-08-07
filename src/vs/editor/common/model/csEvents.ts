/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { URI } from 'vs/base/common/uri';

export type SymbolNavigationEvent = {
	position: Position;
	action: string;
	uri: URI;
};
