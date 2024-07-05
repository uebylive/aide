/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostAideCommandPaletteProviderShape, IMainContext, MainContext, MainThreadAideCommandPaletteProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IAideCommandPaletteRequestModel } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteModel';
import { IAideCommandPaletteData } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteService';
import type * as vscode from 'vscode';

export class ExtHostAideCommandPaletteProvider extends Disposable implements ExtHostAideCommandPaletteProviderShape {

	private static _idPool = 0;

	private readonly _providers = new Map<number, { extension: IExtensionDescription; data: IAideCommandPaletteData; provider: vscode.AideCommandPaletteResponseHandler }>();
	private readonly _proxy: MainThreadAideCommandPaletteProviderShape;

	constructor(
		mainContext: IMainContext,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadAideCommandPaletteProvider);
	}

	async $provideResponse(handle: number, request: IAideCommandPaletteRequestModel, token: CancellationToken): Promise<void> {

		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}

		const extRequest = typeConvert.AideCommandPaletteRequestModel.to(request);
		const task = provider.provider.provideResponse(extRequest, token);

		await raceCancellation(Promise.resolve(task), token);
	}

	registerCommandPaletteProvider(extension: IExtensionDescription, id: string, provider: vscode.AideCommandPaletteResponseHandler): IDisposable {
		const handle = ExtHostAideCommandPaletteProvider._idPool++;
		this._providers.set(handle, { extension, data: { id }, provider });
		this._proxy.$registerCommandPaletteProvider(handle, { id });

		return toDisposable(() => {
			this._proxy.$unregisterCommandPaletteProvider(handle);
		});
	}
}
