/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDevtoolsService = createDecorator<IDevtoolsService>('IDevtoolsService');
export interface IDevtoolsService {
	_serviceBrand: undefined;
	status: DevtoolsStatus;
	startInspectingHost(): void;
	stopInspectingHost(): void;
	onDidTriggerInspectingHostStart: Event<void>;
	onDidTriggerInspectingHostStop: Event<void>;
	isInspecting: boolean;
	latestPayload: any;
}

export enum DevtoolsStatus {
	ServerConnected = 'server-connected',
	DevtoolsConnected = 'devtools-connected',
	Error = 'error',
	Idle = 'idle'
}

export type DevtoolsStatusType = `${DevtoolsStatus}`;
