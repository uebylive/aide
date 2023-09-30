/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ProviderResult } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ArcModel } from 'vs/workbench/contrib/arc/common/arcModel';

export interface IArc {
	id: number; // TODO Maybe remove this and move to a subclass that only the provider knows about
	onDidChangeState?: Event<any>;
	dispose?(): void;
}

export interface IArcProvider {
	readonly id: string;
	readonly displayName: string;
	prepareSession(initialState: undefined, token: CancellationToken): ProviderResult<IArc | undefined>;
}

export const IArcService = createDecorator<IArcService>('IArcService');
export interface IArcService {
	_serviceBrand: undefined;

	registerProvider(provider: IArcProvider): IDisposable;
	startSession(providerId: string, token: CancellationToken): ArcModel | undefined;
}
