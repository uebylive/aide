/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT } from '../../common/aideAgentContextKeys.js';
import { AgentMode } from '../../common/aideAgentModel.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { IAideAgentWidgetService, IChatWidget } from '../aideAgent.js';
import { CHAT_CATEGORY } from './aideAgentChatActions.js';

export interface IVoiceChatExecuteActionContext {
	readonly disableTimeout?: boolean;
}

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
	voice?: IVoiceChatExecuteActionContext;
}

export class SubmitChatRequestAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.chat.submit';

	constructor() {
		super({
			id: SubmitChatRequestAction.ID,
			title: localize2('interactive.chat.submit.label', "Chat"),
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
		widget?.acceptInput(AgentMode.Chat, context?.inputValue);
	}
}

export class SubmitEditsRequestAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.edits.submit';

	constructor() {
		super({
			id: SubmitEditsRequestAction.ID,
			title: localize2('interactive.edit.submit.label', "Edit"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentExecuteSecondary,
					group: 'group_1',
				},
				{
					id: MenuId.AideAgentExecute,
					order: 1,
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
		widget?.acceptInput(AgentMode.Edit, context?.inputValue);
	}
}

export class SubmitPlanRequestAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.plan.submit';

	constructor() {
		super({
			id: SubmitPlanRequestAction.ID,
			title: localize2('interactive.plan.submit.label', "Plan"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideAgentExecute,
					order: 0,
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
		widget?.acceptInput(AgentMode.Plan, context?.inputValue);
	}
}

// export const AgentModePickerActionId = 'workbench.action.aideAgent.setMode';
// MenuRegistry.appendMenuItem(MenuId.AideAgentExecute, {
// 	command: {
// 		id: AgentModePickerActionId,
// 		title: localize2('aideAgent.setMode.label', "Set Mode"),
// 	},
// 	order: 1,
// 	group: 'navigation',
// 	// TODO(@ghostwriternr): This is a hack to get around the pain (very high) of adding a new entry to the chat location
// 	when: ContextKeyExpr.and(CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET.negate(), ContextKeyExpr.equals(CONTEXT_CHAT_LOCATION.key, 'panel')),
// });

// export const AgentScopePickerActionId = 'workbench.action.aideAgent.setScope';
// MenuRegistry.appendMenuItem(MenuId.AideAgentInput, {
// 	command: {
// 		id: AgentScopePickerActionId,
// 		title: localize2('aideAgent.setScope.label', "Set Scope"),
// 	},
// 	order: 2,
// 	group: 'navigation',
// 	when: ContextKeyExpr.and(ContextKeyExpr.equals(CONTEXT_CHAT_LOCATION.key, 'panel'), ContextKeyExpr.equals(CONTEXT_AGENT_MODE.key, AgentMode.Edit)),
// });

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
	registerAction2(SubmitChatRequestAction);
	registerAction2(SubmitEditsRequestAction);
	registerAction2(SubmitPlanRequestAction);
	registerAction2(CancelAction);
}
