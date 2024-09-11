/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IPinnedContextService } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';

export class PinnedContextService implements IPinnedContextService {
	readonly _serviceBrand: undefined;

	private pinnedContexts: URI[] = [];
	private readonly _onDidChangePinnedContexts = new Emitter<void>();
	readonly onDidChangePinnedContexts: Event<void> = this._onDidChangePinnedContexts.event;

	addContext(uri: URI): void {
		if (!this.pinnedContexts.some(pinnedUri => pinnedUri.toString() === uri.toString())) {
			this.pinnedContexts.push(uri);
			this._onDidChangePinnedContexts.fire();
		}
	}

	removeContext(uri: URI): void {
		const initialLength = this.pinnedContexts.length;
		this.pinnedContexts = this.pinnedContexts.filter(pinnedUri => pinnedUri.toString() !== uri.toString());
		if (this.pinnedContexts.length !== initialLength) {
			this._onDidChangePinnedContexts.fire();
		}
	}

	clearContexts(): void {
		if (this.pinnedContexts.length > 0) {
			this.pinnedContexts = [];
			this._onDidChangePinnedContexts.fire();
		}
	}

	getPinnedContexts(): URI[] {
		return [...this.pinnedContexts];
	}
}
