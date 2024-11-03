/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET, CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_INPUT_PLANNING_ENABLED, CONTEXT_CHAT_LOCATION, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT } from '../../common/aideAgentContextKeys.js';
import { AgentMode } from '../../common/aideAgentModel.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { IAideAgentWidgetService, IChatWidget } from '../aideAgent.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export interface IVoiceChatExecuteActionContext {
	readonly disableTimeout?: boolean;
}

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
	voice?: IVoiceChatExecuteActionContext;
}

export class SubmitChatAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.submitChat';

	constructor() {
		super({
			id: SubmitChatAction.ID,
			title: localize2('interactive.submitChat.label', "Chat"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET.negate()),
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentExecuteSecondary,
					group: 'group_1',
					when: CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET.negate(),
				},
				{
					id: MenuId.AideAgentExecute,
					order: 2,
					when: ContextKeyExpr.and(CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET.negate(), CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
					group: 'navigation',
				},
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IAideAgentWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		const input = widget?.getInput() ?? context?.inputValue;

		widget?.acceptInput(AgentMode.Chat, input);
	}
}

export class SubmitEditAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.submitEdit';

	constructor() {
		super({
			id: SubmitEditAction.ID,
			title: localize2('interactive.submitEdit.label', "Edit"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentExecuteSecondary,
					group: 'group_1',
				},
				{
					id: MenuId.AideAgentExecute,
					order: 2,
					when: CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(),
					group: 'navigation',
				},
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IAideAgentWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		const input = widget?.getInput() ?? context?.inputValue;
		const planningEnabled = widget?.planningEnabled ?? false;
		widget?.acceptInput(planningEnabled ? AgentMode.Plan : AgentMode.Edit, input);
	}
}

class TogglePlanningAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.togglePlanning';

	constructor() {
		super({
			id: TogglePlanningAction.ID,
			title: localize2('interactive.togglePlanning.label', "Toggle deep reasoning"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.compass,
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				weight: IsDevelopmentContext ? KeybindingWeight.WorkbenchContrib + 51 : KeybindingWeight.WorkbenchContrib
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const widgetService = accessor.get(IAideAgentWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.togglePlanning();
		}
	}
}

function registerPlanningToggleMenu() {
	MenuRegistry.appendMenuItem(MenuId.AideAgentInput, {
		group: 'navigation',
		command: {
			id: TogglePlanningAction.ID,
			title: localize2('interactive.togglePlanning.label', "Toggle deep reasoning"),
			icon: Codicon.compass,
			toggled: { condition: CONTEXT_CHAT_INPUT_PLANNING_ENABLED, icon: Codicon.compassActive }
		},
	});
}

export const AgentScopePickerActionId = 'workbench.action.aideAgent.setScope';
MenuRegistry.appendMenuItem(MenuId.AideAgentInput, {
	command: {
		id: AgentScopePickerActionId,
		title: localize2('aideAgent.setScope.label', "Set Scope"),
	},
	order: 2,
	group: 'navigation',
	when: ContextKeyExpr.equals(CONTEXT_CHAT_LOCATION.key, 'panel'),
});

export class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.cancel';
	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('interactive.cancel.label', "Cancel"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.debugStop,
			menu: {
				id: MenuId.AideAgentExecute,
				when: CONTEXT_CHAT_REQUEST_IN_PROGRESS,
				order: 2,
				group: 'navigation',
			},
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Escape,
				win: { primary: KeyMod.Alt | KeyCode.Backspace },
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IAideAgentWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const chatService = accessor.get(IAideAgentService);
		if (widget.viewModel) {
			chatService.cancelAllExchangesForSession();
		}
	}
}

export function registerChatExecuteActions() {
	registerAction2(SubmitChatAction);
	registerAction2(SubmitEditAction);
	registerAction2(CancelAction);
	registerAction2(TogglePlanningAction);
	registerPlanningToggleMenu();
}
