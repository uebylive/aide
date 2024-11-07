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
import { CONTEXT_AIDE_PLAN_REVIEW_STATE_EXCHANGEID, CONTEXT_AIDE_PLAN_REVIEW_STATE_SESSIONID, CONTEXT_AIDE_PLAN_REVIEW_STATE_STEP_INDEX, CONTEXT_IN_CHAT_INPUT, CONTEXT_STREAMING_STATE } from '../../common/aideAgentContextKeys.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { IAideAgentWidgetService } from '../aideAgent.js';


export class AcceptEditsAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.acceptEdits';

	constructor() {
		super({
			id: AcceptEditsAction.ID,
			title: localize2('interactiveSession.acceptEdits.label', "Accept edits"),
			keybinding: {
				when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo('Complete'), CONTEXT_STREAMING_STATE.isEqualTo('markedComplete')),
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				//{
				//	id: MenuId.AideAgentPlanLoading, // Debug workaround since sidecar states are not fixed yet
				//	group: 'navigation',
				//	order: 0
				//},
				// Following two states should be merged
				{
					id: MenuId.AideAgentEditsCompleted,
					group: 'navigation',
					order: 1
				},
				// {
				// 	id: MenuId.AideAgentExecute,
				// 	order: 3,
				// 	when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)),
				// 	group: 'navigation',
				// }
			],
			icon: Codicon.check,
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		let exchangeId: string | undefined;
		let sessionId: string | undefined;

		const chatWidgetService = accessor.get(IAideAgentWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		const context = widget?.inputPart.streamingStateWidget?.toolbarContext;
		if (context) {
			exchangeId = context['aideAgentExchangeId'];
			sessionId = context['aideAgentSessionId'];
		}

		if (!exchangeId || !sessionId) {
			console.error(`No exchange id or session id provided for this action: ${AcceptEditsAction.ID}`);
			return;
		}

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
				when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo('Complete'), CONTEXT_STREAMING_STATE.isEqualTo('markedComplete')),
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				// no need to check for when as we swap the toolbar menu completely
				//{
				//	id: MenuId.AideAgentPlanLoading, // Debug workaround since sidecar states are not fixed yet
				//	group: 'navigation',
				//	order: 1
				//},
				// Following two states should be merged
				{
					id: MenuId.AideAgentEditsCompleted,
					group: 'navigation',
					order: 2
				},
				// {
				// 	id: MenuId.AideAgentExecute,
				// 	order: 3,
				// 	when: ContextKeyExpr.or(CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback)), // CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()
				// 	group: 'navigation',
				// }
			],
			icon: Codicon.close,
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		let exchangeId: string | undefined;
		let sessionId: string | undefined;

		const chatWidgetService = accessor.get(IAideAgentWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		const context = widget?.inputPart.streamingStateWidget?.toolbarContext;
		if (context) {
			exchangeId = context['aideAgentExchangeId'];
			sessionId = context['aideAgentSessionId'];
		}

		if (!exchangeId || !sessionId) {
			console.error(`No exchange id or session id provided for this action: ${AcceptEditsAction.ID}`);
			return;
		}

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

class ViewEditsDetailAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.aideAgent.planReviewPaneAction',
			title: localize2('interactiveSession.planReview.label', "View details"),
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.KeyD,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentPlanLoading,
					group: 'navigation',
					order: 0, // First element
				},
				{
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 0 // First hidden element
				}
			],
			icon: Codicon.diff,
			f1: false,
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]) {
		let exchangeId: string | undefined;
		let sessionId: string | undefined;

		const chatWidgetService = accessor.get(IAideAgentWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		const context = widget?.inputPart.streamingStateWidget?.toolbarContext;
		if (context) {
			exchangeId = context['aideAgentExchangeId'];
			sessionId = context['aideAgentSessionId'];
		}

		if (!exchangeId || !sessionId) {
			return;
		}
		try {
			const aidePlanService = accessor.get(IAideAgentPlanService);
			aidePlanService.anchorPlanViewPane(sessionId, exchangeId);
		} catch (exception) {
			console.error(exception);
		}
	}
}

export function registerChatEditsActions() {
	registerAction2(AcceptEditsAction);
	registerAction2(RejectEditsAction);
	registerAction2(ViewEditsDetailAction);
}
