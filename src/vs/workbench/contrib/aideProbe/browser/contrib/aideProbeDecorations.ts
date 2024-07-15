/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';


// Decoration for the go to definition
export const probeDefinitionDecoration = 'aide-probe-definition';
export const probeDefinitionDecorationClass = 'aide-probe-definition-decoration';

// Decoration for the edit
export const editPreviewSymbolDecoration = 'aide-edit-preview-symbol';
export const editPreviewSymbolDecorationClass = 'aide-edit-preview-symbol-decoration';
export const editPreviewSymbolDecorationLineOptions = ModelDecorationOptions.register({
	description: editPreviewSymbolDecoration,
	className: editPreviewSymbolDecorationClass,
	isWholeLine: true,
});

// Decoration for the edit preview
export const editSymbolDecoration = 'aide-edit-symbol';
export const editSymbolDecorationClass = 'aide-edit-symbol-decoration';
export const editSymbolDecorationLineOptions = ModelDecorationOptions.register({
	description: editSymbolDecoration,
	className: editSymbolDecorationClass,
	isWholeLine: true,
});

// Decoration for the probed symbol
const probeSymbolDecoration = 'aide-probe-definition-line';
const probeSymbolDecorationClass = 'aide-probe-definition-line-decoration';
export const symbolDecorationLineOptions = ModelDecorationOptions.register({
	description: probeSymbolDecoration,
	className: probeSymbolDecorationClass,
	isWholeLine: true,
});
