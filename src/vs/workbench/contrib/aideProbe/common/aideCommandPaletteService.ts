/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { createDecorator } from 'vs/platform/instantiation/common/instantiation';


export interface IAideCommandPaletteData {
	id: string;
}

export interface IAideCommandPaletteService {
	_serviceBrand: undefined;

	showPalette(): void;
	hidePalette(): void;
}


export const IAideCommandPaletteService = createDecorator<IAideCommandPaletteService>('IAideCommandPaletteService');

