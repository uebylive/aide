/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostArcShape, ExtHostContext, MainContext, MainThreadArcShape } from 'vs/workbench/api/common/extHost.protocol';
import { IArcContributionService } from 'vs/workbench/contrib/arc/common/arcContributionService';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadArc)
export class MainThreadArc extends Disposable implements MainThreadArcShape {
	private readonly _providerRegistrations = this._register(new DisposableMap<number>());

	private readonly _proxy: ExtHostArcShape;

	constructor(
		extHostContext: IExtHostContext,
		@IArcService private readonly _arcService: IArcService,
		@IArcContributionService private readonly arcContribService: IArcContributionService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostArc);
		console.log(this._proxy);
	}

	async $registerArcProvider(handle: number, id: string): Promise<void> {
		const registration = this.arcContribService.registerProviders.find(staticProvider => staticProvider.id === id);
		if (!registration) {
			throw new Error(`Provider ${id} must be declared in the package.json.`);
		}

		const unreg = this._arcService.registerProvider({
			id,
			displayName: registration.label,
		});

		this._providerRegistrations.set(handle, unreg);
	}

	async $unregisterArcProvider(handle: number): Promise<void> {
		this._providerRegistrations.deleteAndDispose(handle);
	}
}
