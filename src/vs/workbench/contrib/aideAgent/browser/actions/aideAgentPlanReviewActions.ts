/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { PLAN_REVIEW_PANEL_ID, PlanReviewPane } from '../aideAgentPlanReviewViewPane.js';

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
	// Disable the toggle reasoning and the provide Feedback flow
	// registerAction2(class ToggleReasoningAction extends Action2 {
	// 	constructor() {
	// 		super({
	// 			id: 'workbench.action.aideAgent.reviewPlan.toggleReasoning',
	// 			title: localize2('aideAgent.planReview.toggleReasoning', "New Session"),
	// 			category: PLAN_REVIEW_CATEGORY,
	// 			icon: Codicon.unfold,
	// 			f1: true,
	// 			menu: [
	// 				{
	// 					id: MenuId.ViewTitle,
	// 					when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
	// 					group: 'navigation',
	// 					order: 0
	// 				}]
	// 		});
	// 	}

	// 	run(accessor: ServicesAccessor, context: IPlanReviewViewTitleActionContext) {
	// 		console.log('Toggle reasoning', context);
	// 	}
	// });

	// registerAction2(class ProvideFeedbackAction extends Action2 {
	// 	constructor() {
	// 		super({
	// 			id: 'workbench.action.aideAgent.reviewPlan.provideFeedback',
	// 			title: localize2('aideAgent.planReview.provideFeedback', "New Session"),
	// 			category: PLAN_REVIEW_CATEGORY,
	// 			icon: Codicon.commentDiscussion,
	// 			f1: true,
	// 			menu: [
	// 				{
	// 					id: MenuId.ViewTitle,
	// 					when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
	// 					group: 'navigation',
	// 					order: 1
	// 				}]
	// 		});
	// 	}

	// 	run(accessor: any, context: IPlanReviewViewTitleActionContext) {
	// 		console.log('Provide feedback', context);
	// 	}
	// });

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
			console.log(context);
			console.log('Save up to step ', context.stepIndex, context.sessionId, context.exchangeId);
		}
	});

	// AideAgentReviewPlanSteps

	registerAction2(class RejectAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.reviewPlan.rejectAll',
				title: localize2('aideAgent.planReview.rejectAll', "Reject all plan steps"),
				category: PLAN_REVIEW_CATEGORY,
				icon: Codicon.closeAll,
				f1: true,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
						group: 'navigation',
						order: 2
					}]
			});
		}

		run(accessor: any, context: IPlanReviewViewTitleActionContext) {
			console.log('Reject all', context);
		}
	});

	registerAction2(class AcceptAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.reviewPlan.acceptAll',
				title: localize2('aideAgent.planReview.acceptAll', "Accept all plan steps"),
				category: PLAN_REVIEW_CATEGORY,
				icon: Codicon.checkAll,
				f1: true,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', PLAN_REVIEW_PANEL_ID),
						group: 'navigation',
						order: 3
					}]
			});
		}

		run(accessor: ServicesAccessor, context: IPlanReviewViewTitleActionContext) {
			console.log('Accept all', context);
		}
	});
}

