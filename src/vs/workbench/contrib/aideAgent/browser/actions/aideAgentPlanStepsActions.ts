/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAideAgentWidgetService } from '../aideAgent.js';
import { CONTEXT_CHAT_ENABLED, CONTEXT_IN_CHAT_PLAN_STEP, CONTEXT_IN_CHAT_RESPONSE_WITH_PLAN_STEPS } from '../../common/aideAgentContextKeys.js';
import { IChatResponseViewModel, isResponseVM } from '../../common/aideAgentViewModel.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export function registerChatPlanStepActions() {
	registerAction2(class NextPlanStepAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.nextPlanStep',
				title: localize2('interactive.nextPlanStep.label', "Next plan step"),
				keybinding: {
					primary: KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_PLAN_STEP,
				},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateSteps(accessor, false);
		}
	});

	registerAction2(class PreviousPlanStepAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.previousPlanStep',
				title: localize2('interactive.previouslanStep.label', "Previous plan step"),
				keybinding: {
					primary: KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_PLAN_STEP,
				},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateSteps(accessor, true);
		}
	});

	registerAction2(class NavigateIntoStepsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.navigateIntoPlanSteps',
				title: localize2('interactive.previouslanStep.label', "Previous plan step"),
				keybinding: {
					primary: KeyCode.RightArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_RESPONSE_WITH_PLAN_STEPS,
				},
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateIntoSteps(accessor);
		}
	});
}

function navigateIntoSteps(accessor: ServicesAccessor) {
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
	if (responsePlanSteps.length > 0) {
		responsePlanSteps[0].focus();
	}
}

function navigateSteps(accessor: ServicesAccessor, reverse: boolean) {
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
