/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IAideAgentPlanSession {
	readonly sessionId: string;
}

export const IAideAgentPlanService = createDecorator<IAideAgentPlanService>('aideAgentPlanService');
export interface IAideAgentPlanService {
	_serviceBrand: undefined;

	getOrCreatePlan(sessionId: string): IAideAgentPlanSession;
}
