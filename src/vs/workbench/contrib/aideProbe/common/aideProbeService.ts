/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideChatBreakdown, IAideChatMarkdownContent } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { AideProbeModel, AideProbeRequestModel, IAideProbeResponseModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';

export interface IAideProbeData {
	id: string;
}

export type IAideProbeProgress =
	| IAideChatMarkdownContent
	| IAideChatBreakdown;

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
	initiateProbe(model: AideProbeModel, request: string): IInitiateProbeResponseState;
}

export interface IInitiateProbeResponseState {
	responseCreatedPromise: Promise<IAideProbeResponseModel>;
	responseCompletePromise: Promise<void>;
}

export class AideProbeService extends Disposable implements IAideProbeService {
	_serviceBrand: undefined;

	private readonly probeProviders = new Map<string, IAideProbeResolver>();
	private _session: AideProbeModel | undefined;

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
		if (!this._session) {
			this._session = this.instantiationService.createInstance(AideProbeModel);
		}

		return this._session;
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

		const initiateProbeInternal = async () => {
			let rawResult: IAideProbeResult | null | undefined;

			const progressCallback = (progress: IAideProbeProgress) => {
				probeModel.acceptResponseProgress(progress);
				completeResponseCreated();
			};

			try {
				probeModel.request = new AideProbeRequestModel(request);

				const resolver = this.probeProviders.get('aideProbeProvider');
				if (!resolver) {
					throw new Error('No probe provider registered.');
				}

				const result = await resolver.initiate(request, progressCallback, CancellationToken.None);
				rawResult = result;
			} catch (error) {
				console.log(error);
			}

			if (rawResult) {
				probeModel.completeResponse();
			}
		};

		const rawResponsePromise = initiateProbeInternal();
		return {
			responseCreatedPromise: responseCreated.p,
			responseCompletePromise: rawResponsePromise,
		};
	}
}
