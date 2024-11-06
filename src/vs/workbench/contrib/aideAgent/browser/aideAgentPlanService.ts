/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IAideAgentPlanService, IAideAgentPlanSession } from '../common/aideAgentPlanService.js';
import { IChatPlanInfo } from '../common/aideAgentService.js';
import { PLAN_REVIEW_PANEL_ID, PlanReviewPane } from './aideAgentPlanReviewViewPane.js';

/**
 * This creates a copy of the plan similar to what we have on the sidecar even with incremental
 * updates which we are sending, it keeps everything in memory so thats one thing we should figure out
 *
 * I still think we should not do ANY state management over here and instead ping the sidecar and get data
 * from there.. but move fast break things right now.. so lets go with this and fix it forward
 */
class AideAgentPlanSession extends Disposable implements IAideAgentPlanSession {
	constructor(
		readonly sessionId: string,
		readonly exchangeId: string,
	) {
		super();
		this.sessionId = sessionId;
		this.exchangeId = exchangeId;
	}

	updatePlanInfo(planInfo: IChatPlanInfo): void {
		// do something with the plan info over here, for now we are just figuring
		// out the layout
	}
}

export class AideAgentPlanService extends Disposable implements IAideAgentPlanService {
	_serviceBrand: undefined;

	private _planSessions = new DisposableMap<string, IAideAgentPlanSession>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();
	}

	isPlanSession(sessionId: string, exchangeId: string): boolean {
		const lookupKey = `${sessionId}-${exchangeId}`;
		return this._planSessions.has(lookupKey);
	}

	getOrStartPlanSession(sessionId: string, exchangeId: string): IAideAgentPlanSession {
		// Plan belongs to the sessionId and the exchangeId together
		const lookupKey = `${sessionId}-${exchangeId}`;
		const alreadyExists = this._planSessions.get(lookupKey);
		if (alreadyExists) {
			return alreadyExists;
		}

		const planSession = this.instantiationService.createInstance(AideAgentPlanSession, sessionId, exchangeId);
		this._planSessions.set(lookupKey, planSession);
		return planSession;
	}

	async anchorPlanViewPane(sessionId: string, exchangeId: string): Promise<void> {
		// we should very quickly close the plan review pane if it was open and then open it again – (@g-danna) why?
		// this.viewsService.closeView(PLAN_REVIEW_PANEL_ID);
		if (!this.viewsService.isViewVisible(PLAN_REVIEW_PANEL_ID)) {
			await this.viewsService.openView<PlanReviewPane>(PLAN_REVIEW_PANEL_ID)
		}
		const planReviewPane = this.viewsService.getViewWithId<PlanReviewPane>(PLAN_REVIEW_PANEL_ID);
		if (planReviewPane) {
			planReviewPane.anchorPlanReviewPane(sessionId, exchangeId);
		}
	}
}
