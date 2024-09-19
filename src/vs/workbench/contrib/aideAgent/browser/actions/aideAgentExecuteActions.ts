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
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_LOCATION, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT, CONTEXT_LANGUAGE_MODELS_ARE_USER_SELECTABLE, CONTEXT_PARTICIPANT_SUPPORTS_MODEL_PICKER } from '../../common/aideAgentContextKeys.js';
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

export class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('interactive.submit.label', "Send"),
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
		widget?.acceptInput(context?.inputValue);
	}
}

export const ChatModelPickerActionId = 'workbench.action.aideAgent.pickModel';
MenuRegistry.appendMenuItem(MenuId.AideAgentExecute, {
	command: {
		id: ChatModelPickerActionId,
		title: localize2('chat.pickModel.label', "Pick Model"),
	},
	order: 1,
	group: 'navigation',
	when: ContextKeyExpr.and(CONTEXT_LANGUAGE_MODELS_ARE_USER_SELECTABLE, CONTEXT_PARTICIPANT_SUPPORTS_MODEL_PICKER, ContextKeyExpr.equals(CONTEXT_CHAT_LOCATION.key, 'panel')),
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
			chatService.cancelCurrentRequestForSession(widget.viewModel.sessionId);
		}
	}
}

export function registerChatExecuteActions() {
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
}
