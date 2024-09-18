/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IAgentTriggerModel } from 'vs/workbench/contrib/aideAgent/common/aideAgentModel';
import { IAgentResponseProgress } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';

export interface IAgentTriggerComplete {
	errorDetails?: string;
}

export interface IAideAgentImplementation {
	trigger: (request: IAgentTriggerModel, progress: (part: IAgentResponseProgress) => Promise<void>, token: CancellationToken) => Promise<IAgentTriggerComplete | void>;
}
