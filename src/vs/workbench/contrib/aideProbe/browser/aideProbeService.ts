/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IValidEditOperation } from 'vs/editor/common/model';
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
	initiateProbe(model: IAideProbeModel, request: string, edit: boolean): IInitiateProbeResponseState;
	cancelCurrentRequestForSession(sessionId: string): void;
	clearSession(): void;

	readonly onNewEdit: Event<{ resource: URI; edits: IValidEditOperation[] }>;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	protected readonly _onNewEdit = this._store.add(new Emitter<{ resource: URI; edits: IValidEditOperation[] }>());
	readonly onNewEdit: Event<{ resource: URI; edits: IValidEditOperation[] }> = this._onNewEdit.event;

	private readonly _pendingRequests = this._register(new DisposableMap<string, CancellationTokenSource>());
	private probeProvider: IAideProbeResolver | undefined;
	private _model: AideProbeModel | undefined;
	private readonly _modelDisposables = this._register(new DisposableStore());
	private _initiateProbeResponseState: IInitiateProbeResponseState | undefined;

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
			this._modelDisposables.clear();
			this._model.dispose();
		}

		this._model = this.instantiationService.createInstance(AideProbeModel);
		this._modelDisposables.add(this._model.onNewEdit(edits => {
			this._onNewEdit.fire(edits);
		}));
		return this._model;
	}

	initiateProbe(probeModel: AideProbeModel, request: string, edit: boolean): IInitiateProbeResponseState {
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
		if (sessionId) {
			this.cancelCurrentRequestForSession(sessionId);
		}
	}
}
