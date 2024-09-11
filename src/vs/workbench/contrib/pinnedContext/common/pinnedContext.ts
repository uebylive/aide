/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const pinnedContextPaneId = 'pinnedContext';

export interface PinnedContextItem {
	readonly uri: URI;
}

const PINNED_CONTEXT_SERVICE_ID = 'pinnedContextService';
export const IPinnedContextService = createDecorator<IPinnedContextService>(PINNED_CONTEXT_SERVICE_ID);
export interface IPinnedContextService {
	readonly _serviceBrand: undefined;

	readonly onDidChangePinnedContexts: Event<void>;

	addContext(uri: URI): void;
	removeContext(uri: URI): void;
	clearContexts(): void;
	getPinnedContexts(): URI[];
}
