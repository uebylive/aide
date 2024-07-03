/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IAideProbeRequestModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IAideCommandPaletteService = createDecorator<IAideCommandPaletteService>('IAideCommandPaletteService');

export interface IAideCommandPaletteData {
	id: string;
}

export interface IAideCommandPaletteResponse {
	type: 'response';
	response: string;
}

export interface IAideCommandPaletteResponseErrorDetails {
	type: 'error';
	message: string;
}

export type IAideCommandPaletteResult = IAideCommandPaletteResponseErrorDetails | IAideCommandPaletteResponse;

export interface IAideCommandPaletteResolver {
	initiate: (request: IAideProbeRequestModel, token: CancellationToken) => void;
}

export interface IAideCommandPaletteService {
	_serviceBrand: undefined;

	open(): void;
	close(): void;
	registerCommandPaletteProvider(data: IAideCommandPaletteData, resolver: IAideCommandPaletteResolver): IDisposable;
}
