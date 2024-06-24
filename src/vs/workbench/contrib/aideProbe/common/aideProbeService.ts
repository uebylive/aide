/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideChatMarkdownContent } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { AideProbeModel, AideProbeRequestModel, IAideProbeModel, IAideProbeRequestModel, IAideProbeResponseModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';

export interface IAideProbeData {
	id: string;
}

export interface IFollowAlongAction {
	type: 'followAlong';
	status: boolean;
}

export interface IAideProbeUserAction {
	sessionId: string;
	action: IFollowAlongAction;
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

export interface IAideProbeGoToDefinition {
	kind: 'goToDefinition';
	uri: URI;
	name: string;
	range: Range;
	thinking: string;
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideProbeBreakdownContent
	| IAideProbeGoToDefinition;

export interface IAideProbeResponseErrorDetails {
	message: string;
}

export interface IAideProbeResult {
	errorDetails?: IAideProbeResponseErrorDetails;
}

export interface IAideProbeResolver {
	initiate: (request: IAideProbeRequestModel, progress: (part: IAideProbeProgress) => void, token: CancellationToken) => Promise<IAideProbeResult>;
	onUserAction: (action: IAideProbeUserAction) => void;
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
	private probeProvider: IAideProbeResolver | undefined;
	private _model: AideProbeModel | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
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
				const requestModel = new AideProbeRequestModel(probeModel.sessionId, request);

				const resolver = this.probeProvider;
				if (!resolver) {
					throw new Error('No probe provider registered.');
				}

				const result = await resolver.initiate(requestModel, progressCallback, token);
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

		this.probeProvider?.onUserAction({
			sessionId: this._model?.sessionId!,
			action: {
				type: 'followAlong',
				status: follow,
			},
		});
	}
}
