/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAgentTriggerPayload } from './aideAgentModel.js';
import { IAgentResponseProgress } from './aideAgentService.js';

export interface IAgentTriggerComplete {
	errorDetails?: string;
}

export interface IAideAgentImplementation {
	trigger: (request: IAgentTriggerPayload, progress: (part: IAgentResponseProgress) => Promise<void>, token: CancellationToken) => Promise<IAgentTriggerComplete | void>;
}
