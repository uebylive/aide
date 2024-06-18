/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideChatMarkdownContent } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { AideProbeModel, AideProbeRequestModel, IAideProbeModel, IAideProbeResponseModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';

export interface IAideProbeData {
	id: string;
}

interface IReferenceByName {
	name: string;
	uri: URI;
}

export interface IAideProbeBreakdownContent {
	reference: IReferenceByName;
	query?: IMarkdownString;
	reason?: IMarkdownString;
	response?: IMarkdownString;
	kind: 'breakdown';
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideProbeBreakdownContent;

export interface IAideProbeResponseErrorDetails {
	message: string;
}

export interface IAideProbeResult {
	errorDetails?: IAideProbeResponseErrorDetails;
}

export interface IAideProbeResolver {
	initiate: (request: string, progress: (part: IAideProbeProgress) => void, token: CancellationToken) => Promise<IAideProbeResult>;
}

export const IAideProbeService = createDecorator<IAideProbeService>('IAideProbeService');

export interface IAideProbeService {
	_serviceBrand: undefined;
	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): void;

	startSession(): AideProbeModel;
	initiateProbe(model: IAideProbeModel, request: string): IInitiateProbeResponseState;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(sessionId: string): void;

	followAlong(follow: boolean): void;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly probeProviders = new Map<string, IAideProbeResolver>();
	private _model: AideProbeModel | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): IDisposable {
		const existing = this.probeProviders.get(data.id);
		if (existing) {
			throw new Error(`A probe provider with the id '${data.id}' is already registered.`);
		}

		this.probeProviders.set(data.id, resolver);
		return toDisposable(() => {
			this.probeProviders.delete(data.id);
		});
	}

	startSession(): AideProbeModel {
		if (this._model) {
			this._model.dispose();
		}

		this._model = this.instantiationService.createInstance(AideProbeModel);
		return this._model;
	}

	initiateProbe(probeModel: AideProbeModel, request: string): IInitiateProbeResponseState {
		const responseCreated = new DeferredPromise<IAideProbeResponseModel>();
		let responseCreatedComplete = false;
		function completeResponseCreated(): void {
			if (!responseCreatedComplete && probeModel.response) {
				responseCreated.complete(probeModel.response);
				responseCreatedComplete = true;
			}
		}

		const source = new CancellationTokenSource();
		const token = source.token;
		const initiateProbeInternal = async () => {
			const progressCallback = (progress: IAideProbeProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				probeModel.acceptResponseProgress(progress);
				completeResponseCreated();
			};

			const listener = token.onCancellationRequested(() => {
				probeModel.cancelRequest();
			});

			try {
				probeModel.request = new AideProbeRequestModel(request);

				const resolver = this.probeProviders.get('aideProbeProvider');
				if (!resolver) {
					throw new Error('No probe provider registered.');
				}

				const result = await resolver.initiate(request, progressCallback, token);
				if (token.isCancellationRequested) {
					return;
				} else if (result) {
					probeModel.completeResponse();
				}
			} catch (error) {
				console.log(error);
			} finally {
				listener.dispose();
			}
		};

		const rawResponsePromise = initiateProbeInternal();
		this._pendingRequests.set(probeModel.sessionId, source);
		rawResponsePromise.finally(() => {
			this._pendingRequests.deleteAndDispose(probeModel.sessionId);
		});
		return {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};
	}

	cancelCurrentRequestForSession(sessionId: string): void {
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
	}

	clearSession(sessionId: string): void {
		this._model?.dispose();
		this.cancelCurrentRequestForSession(sessionId);
	}

	followAlong(follow: boolean): void {
		this._model?.followAlong(follow);
	}
}
