/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';

export const probeDefinitionDecoration = 'aide-probe-definition';
export const probeDefinitionDecorationClass = 'aide-probe-definition-decoration';
export const editSymbolDecoration = 'aide-edit-symbol';
export const editSymbolDecorationClass = 'aide-edit-symbol-decoration';

const probeSymbolDecoration = 'aide-probe-definition-line';
const probeSymbolDecorationClass = 'aide-probe-definition-line-decoration';
export const symbolDecorationLineOptions = ModelDecorationOptions.register({
	description: probeSymbolDecoration,
	className: probeSymbolDecorationClass,
	isWholeLine: true,
});
