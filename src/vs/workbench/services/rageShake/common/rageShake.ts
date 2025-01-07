/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SystemInfo } from '../../../../platform/diagnostics/common/diagnostics.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface RageShakeReport {
	id: string;
	message: string;
}

export interface IssueReport extends RageShakeReport {
	systemInfo?: SystemInfo;
	screenShot?: ImageBitmap;
}

export const IRageShakeService = createDecorator<IRageShakeService>('rageShakeService');
export interface IRageShakeService {
	readonly _serviceBrand: undefined;

	toggle(): void;
	setActiveSessionId(sessionId: string): void;
}
