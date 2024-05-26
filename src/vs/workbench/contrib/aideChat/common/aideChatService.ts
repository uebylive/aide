/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideChatModel, IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';

export const IAideChatService = createDecorator<IAideChatService>('IAideChatService');

export interface IAideChatService {
	_serviceBrand: undefined;

	startSession(token: CancellationToken): AideChatModel | undefined;
	getOrRestoreSession(sessionId: string): IAideChatModel | undefined;

	clearSession(sessionId: string): void;
}
