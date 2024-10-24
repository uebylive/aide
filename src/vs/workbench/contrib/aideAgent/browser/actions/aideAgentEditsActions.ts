/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IAideAgentCodeEditingService } from '../../common/aideAgentCodeEditingService.js';
import { CONTEXT_STREAMING_STATE } from '../../common/aideAgentContextKeys.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import { ChatStreamingState, IAideAgentService } from '../../common/aideAgentService.js';

export function registerChatEditsActions() {
	registerAction2(class StopEditsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.stopEdits',
				title: localize2('interactiveSession.stopEdits.label', "Stop edits"),
				menu: {
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 2
				},
				icon: Codicon.stopCircle,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Stop edits');
		}
	});


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


	registerAction2(class AcceptAll extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.acceptAll',
				title: localize2('interactiveSession.acceptAll.label', "Accept all edits"),
				menu: [{
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 1
				}, {
					id: MenuId.AideAgentStreamingState,
					when: CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback),
					order: 0,
					group: 'navigation',
				}],
				icon: Codicon.checkAll,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			// These values are set on the toolbar present over in aideAgentRichItem
			const exchangeId = context['aideAgentExchangeId'];
			const sessionId = context['aideAgentSessionId'];
			try {
				const aideAgentSession = accessor.get(IAideAgentService);
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, undefined, true);
			} catch (exception) {
				console.error(exception);
			}

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
			editingSession.accept();
		}
	});

	registerAction2(class RejectAll extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.rejectAll',
				title: localize2('interactiveSession.rejectAll.label', "Reject all edits"),
				menu: [{
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 2
				}, {
					id: MenuId.AideAgentStreamingState,
					when: CONTEXT_STREAMING_STATE.isEqualTo(ChatStreamingState.WaitingFeedback),
					order: 2,
					group: 'navigation',
				}],
				icon: Codicon.closeAll,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			// These values are set on the toolbar present over in aideAgentRichItem
			const exchangeId = context['aideAgentExchangeId'];
			const sessionId = context['aideAgentSessionId'];
			try {
				const aideAgentSession = accessor.get(IAideAgentService);
				// to understand about args[1], args[2], args[3], grep for `aideAgent.rejectAll`
				// and see how these values are passed
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, undefined, false);
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
	});

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
