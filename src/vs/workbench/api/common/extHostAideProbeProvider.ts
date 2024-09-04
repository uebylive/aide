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
import { IAideProbeData, IAideProbeRequestModel, IAideProbeResponseErrorDetails, IAideProbeResult, IAideProbeSessionAction, IAideProbeUserAction } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import type * as vscode from 'vscode';

export class ExtHostAideProbeProvider extends Disposable implements ExtHostAideProbeProviderShape {
	private static _idPool = 0;

	private readonly _providers = new Map<number, { extension: IExtensionDescription; data: IAideProbeData; provider: vscode.ProbeResponseHandler }>();
	private readonly _proxy: MainThreadAideProbeProviderShape;

	constructor(
		mainContext: IMainContext,
	) {
		super();
		this._proxy = mainContext.getProxy(MainContext.MainThreadProbeProvider);
	}

	async $initiateProbe(handle: number, request: IAideProbeRequestModel, token: CancellationToken): Promise<IAideProbeResult | undefined> {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}

		const that = this;
		const extRequest = typeConvert.AideProbeRequestModel.to(request);
		const task = provider.provider.provideProbeResponse(
			extRequest,
			{
				repoMapGeneration(value) {
					const part = new extHostTypes.AideProbeRepoMapGenerationPart(value);
					const dto = typeConvert.AideProbeRepoMapGenerationPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				longContextSearch(value) {
					const part = new extHostTypes.AideProbeLongContextSearchPart(value);
					const dto = typeConvert.AideProbeLongContextSearchPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				codeIterationFinished(value) {
					const dto = typeConvert.AideProbeIterationFinishedPart.from(value);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				initialSearchSymbols(value) {
					const part = new extHostTypes.AideProbeInitialSymbolsPart(value);
					const dto = typeConvert.AideProbeInitialSymbolsPart.from(part.symbols);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				breakdown(value) {
					const part = new extHostTypes.AideChatResponseBreakdownPart(value.reference.uri, value.reference.name, value.query, value.reason, value.response);
					const dto = typeConvert.AideChatResponseBreakdownPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				openFile(value) {
					const part = new extHostTypes.AideProbeOpenFilePart(value.uri);
					const dto = typeConvert.AideProbeOpenFilePart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				referenceFound(value) {
					const part = new extHostTypes.AideReferenceFoundPart(value.references);
					const dto = typeConvert.AideReferenceFoundPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				relevantReference(value) {
					const part = new extHostTypes.AideRelevantReferencePart(value);
					const dto = typeConvert.AideRelevantReferencePart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				followups(value) {
					const part = new extHostTypes.AideFollowupsPart(value);
					const dto = typeConvert.AideFollowupsPart.from(part.followups);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				markdown(value) {
					const part = new extHostTypes.AideChatResponseMarkdownPart(value);
					const dto = typeConvert.AideChatResponseMarkdownPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				location(value) {
					const part = new extHostTypes.AideProbeGoToDefinitionPart(value.uri, value.range, value.name, value.thinking);
					const dto = typeConvert.AideProbeGoToDefinitionPart.from(part);
					that._proxy.$handleProbingProgressChunk(request, dto);
				},
				async codeEdit(value) {
					const dto = typeConvert.AideProbeResponseTextEditPart.from(value);
					await that._proxy.$handleProbingProgressChunk(request, dto);
				}
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

	async $onSessionAction(handle: number, action: IAideProbeSessionAction): Promise<void> {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}

		const extAction = typeConvert.AideProbeSessionAction.to(action);
		await provider.provider.onDidSessionAction(extAction);
		return;
	}

	async $onUserAction(handle: number, action: IAideProbeUserAction): Promise<void> {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}

		const extAction = typeConvert.AideProbeUserAction.to(action);
		await provider.provider.onDidUserAction(extAction);
		return;
	}

	registerProbingProvider(extension: IExtensionDescription, id: string, provider: vscode.ProbeResponseHandler): IDisposable {
		const handle = ExtHostAideProbeProvider._idPool++;
		this._providers.set(handle, { extension, data: { id }, provider });
		this._proxy.$registerProbingProvider(handle, { id });

		return toDisposable(() => {
			this._proxy.$unregisterProbingProvider(handle);
		});
	}
}
