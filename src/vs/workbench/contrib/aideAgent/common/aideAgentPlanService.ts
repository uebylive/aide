/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatPlanInfo } from './aideAgentService.js';

export interface IAideAgentPlanSession {
	readonly sessionId: string;
	readonly exchangeId: string;
	updatePlanInfo(planInfo: IChatPlanInfo): void;
	dispose(): void;
}

export const IAideAgentPlanService = createDecorator<IAideAgentPlanService>('aideAgentPlanService');
export interface IAideAgentPlanService {
	_serviceBrand: undefined;

	/**
	 * Returns true if we have a plan session going on, otherwise it returns false
	 * This can be useful since we have a single pane to show rich information
	 * to the user and have to decide on what goes there
	 */
	isPlanSession(sessionId: string, exchangeId: string): boolean;

	/**
	 * Returns the plan session which is associated with the session and the exchange id
	 * or creates a new one, no guarantee on correctness of the step if its really a plan
	 * or something else
	 */
	getOrStartPlanSession(sessionId: string, exchangeId: string): IAideAgentPlanSession;

	/**
	 * Anchors the plan view pane to the current set of sessionIds and exchangeId
	 */
	anchorPlanViewPane(sessionId: string, exchangeId: string): Promise<void>;
}
