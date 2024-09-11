/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPinnedContextService } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';
import { CONTEXT_HAS_PINNED_CONTEXT } from 'vs/workbench/contrib/pinnedContext/common/pinnedContextContextKeys';

export class PinnedContextService implements IPinnedContextService {
	readonly _serviceBrand: undefined;

	private pinnedContexts: URI[] = [];
	private pinnedContextSet: Set<string> = new Set();
	private readonly _onDidChangePinnedContexts = new Emitter<void>();
	readonly onDidChangePinnedContexts: Event<void> = this._onDidChangePinnedContexts.event;

	private hasPinnedContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.hasPinnedContext = CONTEXT_HAS_PINNED_CONTEXT.bindTo(contextKeyService);
	}

	private updateContextKeys(): void {
		this.hasPinnedContext.set(this.pinnedContexts.length > 0);
	}

	addContext(uri: URI): void {
		const uriString = uri.toString();
		if (!this.pinnedContextSet.has(uriString)) {
			this.pinnedContexts.push(uri);
			this.pinnedContextSet.add(uriString);
			this._onDidChangePinnedContexts.fire();
			this.updateContextKeys();
		}
	}

	removeContext(uri: URI): void {
		const uriString = uri.toString();
		const initialLength = this.pinnedContexts.length;
		this.pinnedContexts = this.pinnedContexts.filter(pinnedUri => pinnedUri.toString() !== uriString);
		this.pinnedContextSet.delete(uriString);
		if (this.pinnedContexts.length !== initialLength) {
			this._onDidChangePinnedContexts.fire();
			this.updateContextKeys();
		}
	}

	clearContexts(): void {
		if (this.pinnedContexts.length > 0) {
			this.pinnedContexts = [];
			this.pinnedContextSet.clear();
			this._onDidChangePinnedContexts.fire();
			this.updateContextKeys();
		}
	}

	setContexts(uris: URI[]): void {
		this.pinnedContexts = uris;
		this.pinnedContextSet = new Set(uris.map(uri => uri.toString()));
		this._onDidChangePinnedContexts.fire();
		this.updateContextKeys();
	}

	getPinnedContexts(): URI[] {
		return [...this.pinnedContexts];
	}

	hasContext(uri: URI): boolean {
		return this.pinnedContextSet.has(uri.toString());
	}
}
