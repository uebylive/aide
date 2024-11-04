/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAideAgentCodeEditingService } from '../../common/aideAgentCodeEditingService.js';
import { CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID, CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID, CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX, CONTEXT_STREAMING_STATE } from '../../common/aideAgentContextKeys.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import { ChatStreamingState, IAideAgentService } from '../../common/aideAgentService.js';


export class AcceptEditsAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.acceptEdits';

	constructor() {
		super({
			id: AcceptEditsAction.ID,
			title: localize2('interactiveSession.acceptEdits.label', "Accept edits"),
			keybinding: {
				when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 1
				}, {
					id: MenuId.AideAgentStreamingState,
					when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
					order: 0,
					group: 'navigation',
				},
				{
					id: MenuId.AideAgentExecute,
					order: 3,
					when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
					group: 'navigation',
				}
			],
			icon: Codicon.check,
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		const context = args[0];
		// These values are set on the toolbar present over in aideAgentRichItem
		const exchangeId = context['aideAgentExchangeId'];
		const sessionId = context['aideAgentSessionId'];
		// Also grab the variables which are set in the global context since this can be part
		// of the plan review flow
		const contextKeyService = accessor.get(IContextKeyService);
		const aidePlanReviewStateSessionId = CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID.getValue(contextKeyService);
		const aidePlanReviewStateExchangeId = CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID.getValue(contextKeyService);
		const aidePlanReviewStateStepId = CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX.getValue(contextKeyService);
		try {
			const aideAgentSession = accessor.get(IAideAgentService);
			if (aidePlanReviewStateSessionId === sessionId && aidePlanReviewStateExchangeId === exchangeId) {
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, aidePlanReviewStateStepId, undefined, true);
			} else {
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, undefined, undefined, true);
			}
		} catch (exception) {
			console.error(exception);
		}

		const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
		const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
		if (aidePlanReviewStateStepId !== undefined && aidePlanReviewStateSessionId === sessionId && aidePlanReviewStateExchangeId === exchangeId) {
			editingSession.acceptUntilExchange(sessionId, exchangeId, aidePlanReviewStateStepId);
		} else {
			editingSession.accept();
		}
	}
}

export class RejectEditsAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.rejectEdits';

	constructor() {
		super({
			id: RejectEditsAction.ID,
			title: localize2('interactiveSession.rejectEdits.label', "Reject edits"),
			keybinding: {
				when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 2
				}, {
					id: MenuId.AideAgentStreamingState,
					when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
					order: 2,
					group: 'navigation',
				},
				{
					id: MenuId.AideAgentExecute,
					order: 3,
					when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)), // CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()
					group: 'navigation',
				}
			],
			icon: Codicon.close,
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		const context = args[0];
		// These values are set on the toolbar present over in aideAgentRichItem
		const exchangeId = context['aideAgentExchangeId'];
		const sessionId = context['aideAgentSessionId'];

		const contextKeyService = accessor.get(IContextKeyService);
		const aidePlanReviewStateSessionId = CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID.getValue(contextKeyService);
		const aidePlanReviewStateExchangeId = CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID.getValue(contextKeyService);
		const aidePlanReviewStateStepId = CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX.getValue(contextKeyService);
		try {
			const aideAgentSession = accessor.get(IAideAgentService);
			if (aidePlanReviewStateSessionId === sessionId && aidePlanReviewStateExchangeId === exchangeId) {
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, aidePlanReviewStateStepId, undefined, false);
			} else {
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, undefined, undefined, false);
			}
		} catch (exception) {
			console.error(exception);
		}

		const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
		const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
		// we reject all the changes which are related to this exchange and not
		// the ones related to the previous one
		// Note: this is an async function so the GC will not clear it when we
		// go out of scope over here in the `run` function
		editingSession.rejectForExchange(sessionId, exchangeId);
	}
}

export function registerChatEditsActions() {
	registerAction2(class SeeEditsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.seeEdits',
				title: localize2('interactiveSession.seeEdits.label', "See edits"),
				menu: {
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 1
				},
				icon: Codicon.diffMultiple,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('See edits');
		}
	});


	registerAction2(class ProvideFeebackAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.provideFeedback',
				title: localize2('interactiveSession.provideFeedback.label', "Provide feedback"),
				menu: [{
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 0
				}, {
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 0
				}],
				icon: Codicon.commentDiscussion,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Provide feedback on edits');
		}
	});

	registerAction2(AcceptEditsAction);
	registerAction2(RejectEditsAction);

	registerAction2(class PlanReviewPaneAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.planReviewPaneAction',
				title: localize2('interactiveSession.planReview.label', "Plan Review Actions"),
				menu: [{
					id: MenuId.AideAgentPlanLoading,
					group: 'navigation',
					order: 2,
				},
				{
					id: MenuId.AideAgentPlanReview,
					group: 'navigation',
					order: 2
				}],
				icon: Codicon.preview,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			// These values are set on the toolbar present over in aideAgentRichItem
			const exchangeId = context['aideAgentExchangeId'];
			const sessionId = context['aideAgentSessionId'];
			try {
				const aidePlanService = accessor.get(IAideAgentPlanService);
				aidePlanService.anchorPlanViewPane(sessionId, exchangeId);
			} catch (exception) {
				console.error(exception);
			}
		}
	});
}
