/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SymbolNavigationEvent } from 'vs/editor/common/model/csEvents';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as TypeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import type { CSEventHandler, SymbolNavigationEvent as ExtSymbolNavigationEvent } from 'vscode';
import { ExtHostCSEventsShape, IMainContext, MainContext, MainThreadCSEventsShape } from './extHost.protocol';

export class ExtHostCSEvents implements ExtHostCSEventsShape {
	private readonly _proxy: MainThreadCSEventsShape;
	private _CSEventHandlers: Map<string, CSEventHandler> = new Map();

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadCSEvents);
	}

	$reportSymbolNavigation(extensionId: string, event: SymbolNavigationEvent): void {
		if (this._CSEventHandlers.size === 0) {
			throw new Error('No CS event handler registered');
		}

		const provider = this._CSEventHandlers.get(extensionId);
		if (!provider) {
			throw new Error('CS event handler not found');
		}

		const position = TypeConverters.Position.to(event.position);
		const action = TypeConverters.SymbolNavigationActionType.to(event.action);
		const uri = event.uri;
		const extEvent: ExtSymbolNavigationEvent = { position, action, uri };

		provider.handleSymbolNavigation(extEvent);
	}

	registerCSEventsHandler(extension: IExtensionDescription, handler: CSEventHandler): Disposable {
		const extensionId = extension.identifier.value;
		this._CSEventHandlers.set(extensionId, handler);
		this._proxy.$registerCSEventHandler(extensionId);
		return new Disposable(() => {
			this._proxy.$unregisterCSEventHandler(extensionId);
			this._CSEventHandlers.delete(extensionId);
		});
	}
}
