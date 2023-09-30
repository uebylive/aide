/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILogService } from 'vs/platform/log/common/log';
import { ARC_PROVIDER_EXISTS } from 'vs/workbench/contrib/arc/common/arcContextKeys';
import { ArcModel } from 'vs/workbench/contrib/arc/common/arcModel';
import { IArcProvider, IArcService } from 'vs/workbench/contrib/arc/common/arcService';

export class ArcService extends Disposable implements IArcService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IArcProvider>();
	private readonly _sessionModels = new Map<string, ArcModel>();

	private readonly _hasProvider: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		console.log('ArcService constructor');

		this._hasProvider = ARC_PROVIDER_EXISTS.bindTo(this.contextKeyService);
	}

	private trace(method: string, message: string): void {
		this.logService.trace(`ArcService#${method}: ${message}`);
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
			this.trace('registerProvider', `Disposing chat provider`);
			this._providers.delete(provider.id);
			this._hasProvider.set(this._providers.size > 0);
		});
	}

	private reinitializeModel(model: ArcModel): void {
		// no-op (for now)
	}
}
