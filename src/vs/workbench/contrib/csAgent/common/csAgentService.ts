/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CSAgentModel } from 'vs/workbench/contrib/csAgent/common/csAgentModel';

export interface ICSAgent {

}

export const ICSAgentService = createDecorator<ICSAgentService>('csAgentService');

export interface ICSAgentService {
	readonly _serviceBrand: undefined;

	startSession(token: CancellationToken): CSAgentModel;
	sendRequest(sessionId: string, message: string, token: CancellationToken): Promise<void>;
}
