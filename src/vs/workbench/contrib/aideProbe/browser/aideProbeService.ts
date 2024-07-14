/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideProbeModel, AideProbeRequestModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeRequestModel, IAideProbeProgress, IAideProbeResult, IAideProbeUserAction, IAideProbeData, IAideProbeModel, IAideProbeResponseModel } from 'vs/workbench/contrib/aideProbe/common/aideProbe';

export type ProbeMode = 'edit' | 'explore';

export interface IAideProbeResolver {
	initiate: (request: IAideProbeRequestModel, progress: (part: IAideProbeProgress) => Promise<void>, token: CancellationToken) => Promise<IAideProbeResult>;
	onUserAction: (action: IAideProbeUserAction) => void;
}

export const IAideProbeService = createDecorator<IAideProbeService>('IAideProbeService');

export interface IAideProbeService {
	_serviceBrand: undefined;
	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): void;

	getSession(): AideProbeModel | undefined;
	startSession(): AideProbeModel;
	initiateProbe(model: IAideProbeModel, request: string): IInitiateProbeResponseState;
	getInitiateProbeState: () => IInitiateProbeResponseState | undefined;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(): void;

	followAlong(follow: boolean): void;
	navigateBreakdown(): void;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellationTokenSource>());
	private probeProvider: IAideProbeResolver | undefined;
	private _model: AideProbeModel | undefined;
	private _didNavigateBreakdown: boolean = false;
	private _initiateProbeResponseState: IInitiateProbeResponseState | undefined;

	getInitiateProbeState(): IInitiateProbeResponseState | undefined {
		return this._initiateProbeResponseState;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	registerProbeProvider(data: IAideProbeData, resolver: IAideProbeResolver): IDisposable {
		if (this.probeProvider) {
			throw new Error(`A probe provider with the id '${data.id}' is already registered.`);
		}

		this.probeProvider = resolver;
		return toDisposable(() => {
			this.probeProvider = undefined;
		});
	}

	getSession(): AideProbeModel | undefined {
		return this._model;
	}

	startSession(): AideProbeModel {
		if (this._model) {
			this._model.dispose();
			this._didNavigateBreakdown = false;
		}

		this._model = this.instantiationService.createInstance(AideProbeModel);
		return this._model;
	}

	initiateProbe(probeModel: AideProbeModel, request: string, edit = true): IInitiateProbeResponseState {
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
			const progressCallback = async (progress: IAideProbeProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				await probeModel.acceptResponseProgress(progress);
				completeResponseCreated();
			};

			const listener = token.onCancellationRequested(() => {
				probeModel.cancelRequest();
			});

			try {
				probeModel.request = new AideProbeRequestModel(probeModel.sessionId, request, edit);

				const resolver = this.probeProvider;
				if (!resolver) {
					throw new Error('No probe provider registered.');
				}

				const result = await resolver.initiate(probeModel.request, progressCallback, token);
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

		this._initiateProbeResponseState = {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};

		return this._initiateProbeResponseState;
	}

	cancelCurrentRequestForSession(sessionId: string): void {
		this._model?.revertEdits();
		this._pendingRequests.get(sessionId)?.cancel();
		this._pendingRequests.deleteAndDispose(sessionId);
	}

	clearSession(): void {
		const sessionId = this._model?.sessionId;
		this._model?.dispose();
		this._model = undefined;
		this._didNavigateBreakdown = false;
		if (sessionId) {
			this.cancelCurrentRequestForSession(sessionId);
		}
	}

	navigateBreakdown(): void {
		if (!this._didNavigateBreakdown) {
			this.probeProvider?.onUserAction({
				sessionId: this._model?.sessionId!,
				action: {
					type: 'navigateBreakdown',
					status: true,
				},
			});
			this._didNavigateBreakdown = true;
		}
	}

	followAlong(follow: boolean): void {
		this._model?.followAlong(follow);
		this.probeProvider?.onUserAction({
			sessionId: this._model?.sessionId!,
			action: {
				type: 'followAlong',
				status: follow,
			},
		});
	}
}
