/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IAideAgentPlanSession {
	readonly sessionId: string;
	readonly exchangeId: string;
	dispose(): void;
}

export const IAideAgentPlanService = createDecorator<IAideAgentPlanService>('aideAgentPlanService');
export interface IAideAgentPlanService {
	_serviceBrand: undefined;

	getOrStartPlanSession(sessionId: string, exchangeId: string): IAideAgentPlanSession;
}
