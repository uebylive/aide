/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostChatVariablesShape, ExtHostContext, MainContext, MainThreadCSChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import { ICSChatVariableData, ICSChatVariablesService } from 'vs/workbench/contrib/csChat/common/csChatVariables';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadCSChatVariables)
export class MainThreadCSChatVariables implements MainThreadCSChatVariablesShape {

	private readonly _proxy: ExtHostChatVariablesShape;
	private readonly _variables = new DisposableMap<number>();

	constructor(
		extHostContext: IExtHostContext,
		@ICSChatVariablesService private readonly _chatVariablesService: ICSChatVariablesService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCSChatVariables);
	}

	dispose(): void {
		this._variables.clearAndDisposeAll();
	}

	$registerVariable(handle: number, data: ICSChatVariableData): void {
		const registration = this._chatVariablesService.registerVariable(data, (messageText, _arg, _model, token) => {
			return this._proxy.$resolveVariable(handle, messageText, token);
		});
		this._variables.set(handle, registration);
	}

	$unregisterVariable(handle: number): void {
		this._variables.deleteAndDispose(handle);
	}
}
