/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { ICSAccountService } from 'vs/platform/codestoryAccount/common/csAccount';
import { ExtHostAideAgentProviderShape, ExtHostContext, IAideAgentProgressDto, MainContext, MainThreadAideAgentProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAideAgentImplementation } from 'vs/workbench/contrib/aideAgent/common/aideAgent';
import { IAgentResponseProgress, IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadAideAgentProvider)
export class MainThreadAideAgentProvider extends Disposable implements MainThreadAideAgentProviderShape {
	private readonly _proxy: ExtHostAideAgentProviderShape;
	private readonly _pendingProgress = new Map<string, (part: any) => Promise<void>>();

	constructor(
		extHostContext: IExtHostContext,
		@IAideAgentService private readonly aideAgentService: IAideAgentService,
		@ICSAccountService private readonly csAccountService: ICSAccountService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAideAgentProvider);
	}

	$registerAideAgentProvider(handle: number): void {
		const impl: IAideAgentImplementation = {
			trigger: async (request, progress, token) => {
				const authenticated = await this.csAccountService.ensureAuthenticated();
				if (!authenticated) {
					return {};
				}

				this._pendingProgress.set(request.id, progress);
				try {
					return await this._proxy.$trigger(handle, request, token) || {};
				} finally {
					this._pendingProgress.delete(request.id);
				}
			}
		};

		this.aideAgentService.registerAgentProvider(impl);
	}

	async $handleProgress(requestId: string, progress: IAideAgentProgressDto, handle?: number): Promise<number | void> {
		const revivedProgress = revive(progress) as IAgentResponseProgress;
		if (revivedProgress.kind === 'progressTask') {
			//
		} else if (handle !== undefined) {

		}
		this._pendingProgress.get(requestId)?.(revivedProgress);
	}

	$unregisterAideAgentProvider(handle: number): void {
		// TODO
	}
}
