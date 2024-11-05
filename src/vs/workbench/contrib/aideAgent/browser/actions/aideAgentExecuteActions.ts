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
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CONTEXT_AIDE_PLAN_INPUT, CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET, CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT } from '../../common/aideAgentContextKeys.js';
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
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_INPUT_HAS_TEXT),
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
					when: ContextKeyExpr.and(CONTEXT_CHAT_IN_PASSTHROUGH_WIDGET.negate()), // and CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()
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

export class SubmitPlanRequestAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.plan.submit';

	constructor() {
		super({
			id: SubmitPlanRequestAction.ID,
			title: localize2('interactive.edit.submit.label', "Edit"),
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
					when: CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), // CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()
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
		// deprecating planningEnable as we want to funnel user to plan

		widget?.acceptInput(AgentMode.Plan, input);
	}
}

class TogglePlanningAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.togglePlanning';

	constructor() {
		super({
			id: TogglePlanningAction.ID,
			title: localize2('interactive.togglePlanning.label', "Toggle additional reasoning"),
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

// Remove toggle for additional reasoning
// function registerPlanningToggleMenu() {
// 	MenuRegistry.appendMenuItem(MenuId.AideAgentInput, {
// 		group: 'navigation',
// 		command: {
// 			id: TogglePlanningAction.ID,
// 			title: localize2('interactive.togglePlanning.label', "Toggle additional reasoning"),
// 			icon: Codicon.compass,
// 			toggled: { condition: CONTEXT_CHAT_INPUT_PLANNING_ENABLED, icon: Codicon.compassActive }
// 		},
// 	});
// }

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
			icon: Codicon.stopCircle,
			menu: [
				// 	{
				// 	id: MenuId.AideAgentExecute,
				// 	when: CONTEXT_CHAT_REQUEST_IN_PROGRESS,
				// 	order: 2,
				// 	group: 'navigation',
				// },
				{
					id: MenuId.AideAgentPlanLoading,
					// no need to check for when as we swap the toolbar menu completely
					order: 1,
					group: 'navigation',
				},
				{
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 0 // First hidden element
				}
			],
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

		// TODO(skcd): Cancel here needs to do more than just cancel the running
		// exchanges, we have to make sure that the running plan gets rejected
		// properly and the UX is updated about it
		const chatService = accessor.get(IAideAgentService);
		if (widget.viewModel) {
			chatService.cancelAllExchangesForSession();
			const model = chatService.getSession(widget.viewModel.sessionId);
			model?.handleUserCancelActionForSession();
		}
	}
}

export class ContinueEditing extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.continueEditing';
	constructor() {
		super({
			id: ContinueEditing.ID,
			title: localize2('interactive.continueEditing.label', "Continue Editing"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			menu: [{
				id: MenuId.AideAgentExecute,
				when: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_AIDE_PLAN_INPUT, CONTEXT_CHAT_INPUT_HAS_TEXT),
				order: 2,
				group: 'navigation',
			}],
			keybinding: {
				when: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_AIDE_PLAN_INPUT, CONTEXT_CHAT_INPUT_HAS_TEXT),
				weight: KeybindingWeight.WorkbenchContrib + 51,
				// This keycombination is totally fucked but its a good start
				// TODO(codestory): Fix this to render better
				primary: KeyCode.Enter,
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
		const sessionId = widget.runningSessionId;
		const exchangeId = widget.runningExchangeId;
		const input = widget?.getInput() ?? context?.inputValue;
		if (sessionId && exchangeId) {
			widget?.acceptIterationInput(input, sessionId, exchangeId);
		}
	}
}

export function registerChatExecuteActions() {
	registerAction2(SubmitChatRequestAction);
	registerAction2(SubmitPlanRequestAction);
	registerAction2(CancelAction);
	registerAction2(ContinueEditing);
	registerAction2(TogglePlanningAction);
}
