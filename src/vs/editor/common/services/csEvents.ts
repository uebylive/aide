/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { SymbolNavigationEvent } from 'vs/editor/common/model/csEvents';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ICSEventHandler {
	reportSymbolNavigation(event: SymbolNavigationEvent): void;
}

export const ICSEventsService = createDecorator<ICSEventsService>('csEventsService');

export interface ICSEventsService {
	readonly _serviceBrand: undefined;
	reportSymbolNavigation(event: SymbolNavigationEvent): void;
	registerCSEventsHandler(extensionId: string, handler: ICSEventHandler): IDisposable;
}
