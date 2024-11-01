/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID, CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID, CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX } from '../../common/aideAgentContextKeys.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { PlanReviewPane } from '../aideAgentPlanReviewViewPane.js';

export interface IPlanReviewViewTitleActionContext {
	planReviewView: PlanReviewPane;
}

export interface IPlanReviewStepActionContext {
	stepIndex: number;
	exchangeId: string;
	sessionId: string;
}

export const PLAN_REVIEW_CATEGORY = localize2('aideAgent.category', 'Aide');

export function registerPlanReviewActions() {
	registerAction2(class DropStepsAfterAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.reviewPlan.dropStepsAfter',
				title: localize2('aideAgent.planReview.dropStepsAfter', "Drop this step and following ones"),
				category: PLAN_REVIEW_CATEGORY,
				icon: Codicon.close,
				menu: [
					{
						id: MenuId.AideAgentReviewPlanSteps,
						// when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
						group: 'navigation',
						order: 0
					}]
			});
		}

		run(accessor: ServicesAccessor, context: IPlanReviewStepActionContext) {
			console.log('Drop from step', context.stepIndex, context.sessionId, context.exchangeId);
			// a couple of things which should happen over here:
			// 1. if we are dropping at step 0 then we should show that all steps until the end are dropped :O
			// 2. if we are dropping from a point then we need to know what other steps there are, what if they are streaming
			// how do we make sure that it stays updated? (maybe we keep it until a point)
			const aideAgentService = accessor.get(IAideAgentService);
			if (context.stepIndex === 0) {
				aideAgentService.pushProgress(context.sessionId, {
					kind: 'planInfo',
					exchangeId: context.exchangeId,
					isStale: false,
					sessionId: context.sessionId,
					state: 'Cancelled',
					description: new MarkdownString('Dropping the whole plan'),
				});
			} else {
				// aideAgentService.pushProgress(context.sessionId, {
				// 	kind: 'planInfo',
				// 	exchangeId: context.exchangeId,
				// 	isStale: false,
				// 	sessionId: context.sessionId,
				// 	state: 'InReview',
				// 	description: new MarkdownString(`Accepting changes until ${context.stepIndex}`)
				// });
			}
		}
	});

	registerAction2(class SaveStepsUpToAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.reviewPlan.saveStepsUpTo',
				title: localize2('aideAgent.planReview.saveStepsUpTo', "Save steps up to this one"),
				category: PLAN_REVIEW_CATEGORY,
				icon: Codicon.check,
				menu: [
					{
						id: MenuId.AideAgentReviewPlanSteps,
						//when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
						group: 'navigation',
						order: 1
					}]
			});
		}

		run(accessor: ServicesAccessor, context: IPlanReviewStepActionContext) {
			// Setup our context variables over here
			const contextKeyService = accessor.get(IContextKeyService);
			CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID.bindTo(contextKeyService).set(context.sessionId);
			CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID.bindTo(contextKeyService).set(context.exchangeId);
			CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX.bindTo(contextKeyService).set(context.stepIndex);
			// a couple of things which we want to do because of this
			// 1. update our plan review state on the sidepanel to reflect the changes
			// which have been accepted
			// 2. make sure that once that's done, we also update the hunks accordingly
			// Things to figure out:
			// 3. how to show the status of the plan even when new requests are coming in (say the plan is long)
			// 4. once the state changes to complete we should only show the selection by the user
			// 5. the selection should be smart to only show the latest change which is present
			const aideAgentService = accessor.get(IAideAgentService);
			// [1] push update so we can update our rich element
			// aideAgentService.pushProgress(context.sessionId, {
			// 	kind: 'planInfo',
			// 	exchangeId: context.exchangeId,
			// 	isStale: false,
			// 	sessionId: context.sessionId,
			// 	state: `InReview`,
			// 	description: new MarkdownString(`Accepting changes until ${context.stepIndex + 1}`),
			// });

			// [2] push an update for the hunks over here
			// TODO(skcd): This is not yet working properly, debug why :|
			// use a multi-file edit with at least 2 steps to triage this
			aideAgentService.pushProgress(context.sessionId, {
				kind: 'planEditInfo',
				currentStepIndex: context.stepIndex,
				startStepIndex: 0,
				exchangeId: context.exchangeId,
				sessionId: context.sessionId,
			});
		}
	});
}
