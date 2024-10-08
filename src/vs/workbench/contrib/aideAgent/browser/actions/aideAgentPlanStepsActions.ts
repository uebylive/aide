/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAideAgentWidgetService } from '../aideAgent.js';
import { CONTEXT_CHAT_ENABLED } from '../../common/aideAgentContextKeys.js';
import { IChatResponseViewModel, isResponseVM } from '../../common/aideAgentViewModel.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export function registerChatPlanStepActions() {
	registerAction2(class NextPlanStepAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.nextPlanStep',
				title: localize2('interactive.nextPlanStep.label', "Next plan step"),
				//keybinding: {
				//	primary: KeyMod.CtrlCmd | KeyCode.F9,
				//	weight: KeybindingWeight.WorkbenchContrib,
				//	when: CONTEXT_IN_CHAT_SESSION,
				//},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateTrees(accessor, false);
		}
	});

	registerAction2(class PreviousPlanStepAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.nextPlanStep',
				title: localize2('interactive.nextPlanStep.label', "Previous plan step"),
				//keybinding: {
				//	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F9,
				//	weight: KeybindingWeight.WorkbenchContrib,
				//	when: CONTEXT_IN_CHAT_SESSION,
				//},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateTrees(accessor, true);
		}
	});
}

function navigateTrees(accessor: ServicesAccessor, reverse: boolean) {
	const chatWidgetService = accessor.get(IAideAgentWidgetService);
	const widget = chatWidgetService.lastFocusedWidget;
	if (!widget) {
		return;
	}

	const focused = !widget.inputEditor.hasWidgetFocus() && widget.getFocus();
	const focusedResponse = isResponseVM(focused) ? focused : undefined;

	const currentResponse = focusedResponse ?? widget.viewModel?.getItems().reverse().find((item): item is IChatResponseViewModel => isResponseVM(item));
	if (!currentResponse) {
		return;
	}

	widget.reveal(currentResponse);
	const responsePlanSteps = widget.getPlanStepsInfoForResponse(currentResponse);
	const lastFocusedFileTree = widget.getLastFocusedPlanStepForResponse(currentResponse);
	const focusIdx = lastFocusedFileTree ?
		(lastFocusedFileTree.stepIndex + (reverse ? -1 : 1) + responsePlanSteps.length) % responsePlanSteps.length :
		reverse ? responsePlanSteps.length - 1 : 0;

	responsePlanSteps[focusIdx]?.focus();
}
