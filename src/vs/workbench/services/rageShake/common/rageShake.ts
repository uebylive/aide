/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface RageShakeReport {
	id: string;
	message: string;
}

export interface IssueReport extends RageShakeReport {
	systemInfo?: any; // TODO @g-danna type this better
	screenShot?: ImageBitmap;
}

export const IRageShakeService = createDecorator<IRageShakeService>('rageShakeService');
export interface IRageShakeService {
	readonly _serviceBrand: undefined;

	toggle(): void;
}

export const IRageShakeLogsService = createDecorator<IRageShakeLogsService>('rageShakeLogsService');
export interface IRageShakeLogsService {
	readonly _serviceBrand: undefined;

	getLatestLogs(): Promise<string | undefined>;
}
