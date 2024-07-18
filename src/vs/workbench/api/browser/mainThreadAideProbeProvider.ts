/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { ExtHostAideProbeProviderShape, ExtHostContext, IAideProbeProgressDto, MainContext, MainThreadAideProbeProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAideProbeResolver, IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { IAideProbeData, IAideProbeProgress, IAideProbeRequestModel, IAideProbeUserAction } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadProbeProvider)
export class MainThreadAideProbeProvider extends Disposable implements MainThreadAideProbeProviderShape {
	private readonly _proxy: ExtHostAideProbeProviderShape;
	private readonly _pendingProgress = new Map<string, (part: IAideProbeProgress) => Promise<void>>();

	constructor(
		extHostContext: IExtHostContext,
		@IAideProbeService private readonly _aideProbeService: IAideProbeService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAideProbeProvider);
	}

	$registerProbingProvider(handle: number, data: IAideProbeData): void {
		const impl: IAideProbeResolver = {
			initiate: async (request, progress, token) => {
				this._pendingProgress.set(request.sessionId, progress);
				try {
					return await this._proxy.$initiateProbe(handle, request, token) ?? {};
				} finally {
					this._pendingProgress.delete(request.sessionId);
				}
			},
			onUserAction: (action: IAideProbeUserAction) => {
				this._proxy.$onUserAction(handle, action);
			}
		};

		this._aideProbeService.registerProbeProvider(data, impl);
	}

	async $handleProbingProgressChunk(request: IAideProbeRequestModel, progress: IAideProbeProgressDto): Promise<void> {
		const revivedProgress = revive(progress) as IAideProbeProgress;
		await this._pendingProgress.get(request.sessionId)?.(revivedProgress);
	}

	$unregisterProbingProvider(handle: number): void {
		throw new Error('Method not implemented.');
	}
}
