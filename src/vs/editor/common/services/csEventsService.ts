/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { SymbolNavigationEvent } from 'vs/editor/common/model/csEvents';
import { ICSEventHandler, ICSEventsService } from 'vs/editor/common/services/csEvents';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class CSEventsService implements ICSEventsService {
	declare readonly _serviceBrand: undefined;

	private readonly _handlers = new Map<string, ICSEventHandler>();

	registerCSEventsHandler(extensionId: string, handler: ICSEventHandler): IDisposable {
		this._handlers.set(extensionId, handler);
		return toDisposable(() => this._handlers.delete(extensionId));
	}

	reportSymbolNavigation(event: SymbolNavigationEvent): void {
		for (const [_, handler] of this._handlers) {
			handler.reportSymbolNavigation(event);
		}
	}
}

registerSingleton(ICSEventsService, CSEventsService, InstantiationType.Delayed);
