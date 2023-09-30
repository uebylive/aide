/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IArcProvider {
	readonly id: string;
	readonly displayName: string;
}

export const IArcService = createDecorator<IArcService>('IArcService');
export interface IArcService {
	_serviceBrand: undefined;

	registerProvider(provider: IArcProvider): IDisposable;
}
