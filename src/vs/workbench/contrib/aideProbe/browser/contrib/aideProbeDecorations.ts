/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';

export const symbolDecoration = 'aide-probe-definition';
export const symbolDecorationClass = 'aide-probe-definition-decoration';

const symbolDecorationLine = 'aide-probe-definition-line';
const symbolDecorationLineClass = 'aide-probe-definition-line-decoration';
export const symbolDecorationLineOptions = ModelDecorationOptions.register({
	description: symbolDecorationLine,
	className: symbolDecorationLineClass,
	isWholeLine: true,
});
