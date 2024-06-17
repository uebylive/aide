/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { ExtHostAideProbeProviderShape, ExtHostContext, IAideProbeProgressDto, MainContext, MainThreadAideProbeProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAideProbeData, IAideProbeProgress, IAideProbeResolver, IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadProbeProvider)
export class MainThreadAideProbeProvider extends Disposable implements MainThreadAideProbeProviderShape {
	private readonly _proxy: ExtHostAideProbeProviderShape;
	private readonly _pendingProgress = new Map<string, (part: IAideProbeProgress) => void>();

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
				this._pendingProgress.set(request, progress);
				try {
					return await this._proxy.$initiateProbe(handle, request, token) ?? {};
				} finally {
					this._pendingProgress.delete(request);
				}
			}
		};

		this._aideProbeService.registerProbeProvider(data, impl);
	}

	async $handleProbingProgressChunk(requestId: string, progress: IAideProbeProgressDto): Promise<void> {
		const revivedProgress = revive(progress) as IAideProbeProgress;
		this._pendingProgress.get(requestId)?.(revivedProgress);
	}

	$unregisterProbingProvider(handle: number): void {
		throw new Error('Method not implemented.');
	}
}
