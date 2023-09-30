/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostArcShape, ExtHostContext, MainContext, MainThreadArcShape } from 'vs/workbench/api/common/extHost.protocol';
import { IArcContributionService } from 'vs/workbench/contrib/arc/common/arcContributionService';
import { IArc, IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadArc)
export class MainThreadArc extends Disposable implements MainThreadArcShape {
	private readonly _providerRegistrations = this._register(new DisposableMap<number>());
	private readonly _stateEmitters = new Map<number, Emitter<any>>();

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
		const registration = this.arcContribService.registeredProviders.find(staticProvider => staticProvider.id === id);
		if (!registration) {
			throw new Error(`Provider ${id} must be declared in the package.json.`);
		}

		const unreg = this._arcService.registerProvider({
			id,
			displayName: registration.label,
			prepareSession: async (initialState, token) => {
				const session = await this._proxy.$prepareArc(handle, initialState, token);
				if (!session) {
					return undefined;
				}

				const emitter = new Emitter<any>();
				this._stateEmitters.set(session.id, emitter);
				return <IArc>{
					id: session.id,
					onDidChangeState: emitter.event,
					dispose: () => {
						emitter.dispose();
						this._stateEmitters.delete(session.id);
					}
				};
			},
		});

		this._providerRegistrations.set(handle, unreg);
	}

	async $unregisterArcProvider(handle: number): Promise<void> {
		this._providerRegistrations.deleteAndDispose(handle);
	}
}
