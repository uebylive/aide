/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ARC_PROVIDER_EXISTS } from 'vs/workbench/contrib/arc/common/arcContextKeys';
import { ArcModel } from 'vs/workbench/contrib/arc/common/arcModel';
import { IArc, IArcProvider, IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class ArcService extends Disposable implements IArcService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IArcProvider>();
	private readonly _sessionModels = new Map<string, ArcModel>();

	private readonly _hasProvider: IContextKey<boolean>;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		console.log('ArcService constructor');

		this._hasProvider = ARC_PROVIDER_EXISTS.bindTo(this.contextKeyService);
	}

	private trace(method: string, message: string): void {
		this.logService.trace(`ArcService#${method}: ${message}`);
	}

	startSession(providerId: string, token: CancellationToken): ArcModel {
		this.trace('startSession', `providerId=${providerId}`);
		return this._startSession(providerId, undefined, token);
	}

	private _startSession(providerId: string, someSessionHistory: undefined, token: CancellationToken): ArcModel {
		const model = this.instantiationService.createInstance(ArcModel, providerId);
		this._sessionModels.set(model.sessionId, model);
		const modelInitPromise = this.initializeSession(model, token);
		modelInitPromise.catch(err => {
			this.trace('startSession', `initializeSession failed: ${err}`);
			model.dispose();
			this._sessionModels.delete(model.sessionId);
		});

		return model;
	}

	private async initializeSession(model: ArcModel, token: CancellationToken): Promise<void> {
		await this.extensionService.activateByEvent(`onArcSession:${model.providerId}`);

		const provider = this._providers.get(model.providerId);
		if (!provider) {
			throw new Error(`Unknown provider: ${model.providerId}`);
		}

		let session: IArc | undefined;
		try {
			session = await provider.prepareSession(model.providerState, token) ?? undefined;
		} catch (err) {
			this.trace('initializeSession', `Provider initializeSession threw: ${err}`);
		}

		if (!session) {
			throw new Error('Provider returned no session');
		}

		this.trace('startSession', `Provider returned session`);

		model.initialize(session);
	}

	registerProvider(provider: IArcProvider): IDisposable {
		this.trace('registerProvider', `Adding new arc provider`);

		if (this._providers.has(provider.id)) {
			throw new Error(`Provider ${provider.id} already registered`);
		}

		this._providers.set(provider.id, provider);
		this._hasProvider.set(true);

		Array.from(this._sessionModels.values())
			.filter(model => model.providerId === provider.id)
			.forEach(model => this.reinitializeModel(model));

		return toDisposable(() => {
			this.trace('registerProvider', `Disposing arc provider`);
			this._providers.delete(provider.id);
			this._hasProvider.set(this._providers.size > 0);
		});
	}

	private reinitializeModel(model: ArcModel): void {
		// no-op (for now)
	}
}
