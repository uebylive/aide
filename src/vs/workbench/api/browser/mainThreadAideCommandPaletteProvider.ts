/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostAideCommandPaletteProviderShape, ExtHostContext, MainContext, MainThreadAideCommandPaletteProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAideCommandPaletteData, IAideCommandPaletteResolver, IAideCommandPaletteService } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadAideCommandPaletteProvider)
export class MainThreadAideCommandPaletteProvider extends Disposable implements MainThreadAideCommandPaletteProviderShape {
	private readonly _proxy: ExtHostAideCommandPaletteProviderShape;

	constructor(
		extHostContext: IExtHostContext,
		@IAideCommandPaletteService private readonly _aideCommandPaletteService: IAideCommandPaletteService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAideCommandPaletteProvider);
	}

	$registerCommandPaletteProvider(handle: number, data: IAideCommandPaletteData): void {
		const impl: IAideCommandPaletteResolver = {
			initiate: (request, token) => {
				this._proxy.$provideResponse(handle, request, token);
			},
		};
		this._aideCommandPaletteService.registerCommandPaletteProvider(data, impl);
	}

	$unregisterCommandPaletteProvider(handle: number): void {
		throw new Error('Method not implemented.');
	}
}
