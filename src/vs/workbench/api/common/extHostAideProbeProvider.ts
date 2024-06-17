/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostAideProbeProviderShape, IMainContext, MainContext, MainThreadAideProbeProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IAideProbeData, IAideProbeResponseErrorDetails, IAideProbeResult } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import type * as vscode from 'vscode';

export class ExtHostAideProbeProvider extends Disposable implements ExtHostAideProbeProviderShape {
	private static _idPool = 0;

	private readonly _providers = new Map<number, { extension: IExtensionDescription; data: IAideProbeData; provider: vscode.ProbeResponseProvider }>();
	private readonly _proxy: MainThreadAideProbeProviderShape;

	constructor(
		mainContext: IMainContext,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadProbeProvider);
	}

	async $initiateProbe(handle: number, request: string, token: CancellationToken): Promise<IAideProbeResult | undefined> {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}

		const that = this;
		const task = provider.provider.provideProbeResponse(
			request,
			{
				breakdown(value) {
					const part = new extHostTypes.AideChatResponseBreakdownPart(value.reference.uri, value.reference.name, value.query, value.reason, value.response);
					const dto = typeConvert.AideChatResponseBreakdownPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				markdown(value) {
					const part = new extHostTypes.AideChatResponseMarkdownPart(value);
					const dto = typeConvert.AideChatResponseMarkdownPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
			},
			token
		);

		return await raceCancellation(Promise.resolve(task).then((result) => {
			let errorDetails: IAideProbeResponseErrorDetails | undefined;
			if (result?.errorDetails) {
				errorDetails = {
					...result.errorDetails
				};
			}

			return { errorDetails };
		}), token);
	}

	registerProbingProvider(extension: IExtensionDescription, id: string, provider: vscode.ProbeResponseProvider): IDisposable {
		const handle = ExtHostAideProbeProvider._idPool++;
		this._providers.set(handle, { extension, data: { id }, provider });
		this._proxy.$registerProbingProvider(handle, { id });

		return toDisposable(() => {
			this._proxy.$unregisterProbingProvider(handle);
		});
	}
}
