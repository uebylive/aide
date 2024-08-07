/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ICSEventHandler, ICSEventsService } from 'vs/editor/common/services/csEvents';
import { ExtHostCSEventsShape, ExtHostContext, MainContext, MainThreadCSEventsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadCSEvents)
export class MainThreadCSEvents extends Disposable implements MainThreadCSEventsShape {
	private readonly _proxy: ExtHostCSEventsShape;
	private readonly _registrationsUri = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@ICSEventsService private readonly _csEventsService: ICSEventsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCSEvents);
	}

	$registerCSEventHandler(extensionId: string): void {
		const handler: ICSEventHandler = {
			reportSymbolNavigation: (event) => {
				this._proxy.$reportSymbolNavigation(extensionId, event);
			}
		};
		this._registrationsUri.set(extensionId, this._csEventsService.registerCSEventsHandler(extensionId, handler));
	}

	$unregisterCSEventHandler(extensionId: string): void {
		this._registrationsUri.deleteAndDispose(extensionId);
	}
}
