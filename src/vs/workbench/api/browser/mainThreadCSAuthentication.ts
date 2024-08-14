/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { CSAuthenticationSession, ICSAuthenticationService } from 'vs/platform/codestoryAccount/common/csAccount';
import { MainContext, MainThreadCSAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadCSAuthentication)
export class MainThreadCSAuthentication extends Disposable implements MainThreadCSAuthenticationShape {
	constructor(
		extHostContext: IExtHostContext,
		@ICSAuthenticationService private readonly _csAccountService: ICSAuthenticationService
	) {
		super();
	}

	$getSession(): Promise<CSAuthenticationSession | undefined> {
		return Promise.resolve(this._csAccountService.getSession());
	}
}
