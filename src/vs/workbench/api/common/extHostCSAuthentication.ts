/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostCSAuthenticationShape, MainContext, MainThreadCSAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import type * as vscode from 'vscode';

export interface IExtHostCSAuthentication extends ExtHostCSAuthentication { }
export const IExtHostCSAuthentication = createDecorator<IExtHostCSAuthentication>('IExtHostCSAuthentication');

export class ExtHostCSAuthentication implements ExtHostCSAuthenticationShape {
	declare _serviceBrand: undefined;

	private _proxy: MainThreadCSAuthenticationShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadCSAuthentication);
	}

	async getSession(): Promise<vscode.CSAuthenticationSession | undefined> {
		return this._proxy.$getSession();
	}
}
