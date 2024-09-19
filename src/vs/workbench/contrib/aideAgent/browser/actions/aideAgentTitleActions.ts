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
import { CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_REQUEST } from '../../common/aideAgentContextKeys.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { isRequestVM, isResponseVM } from '../../common/aideAgentViewModel.js';
import { IAideAgentWidgetService } from '../aideAgent.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export const MarkUnhelpfulActionId = 'workbench.action.aideAgent.markUnhelpful';

export function registerChatTitleActions() {
	registerAction2(class RemoveAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.remove',
				title: localize2('chat.remove.label', "Remove Request and Response"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.x,
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					},
					when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate()),
					weight: KeybindingWeight.WorkbenchContrib,
				},
				menu: {
					id: MenuId.AideAgentMessageTitle,
					group: 'navigation',
					order: 2,
					when: CONTEXT_REQUEST
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			let item = args[0];
			if (!isRequestVM(item)) {
				const chatWidgetService = accessor.get(IAideAgentWidgetService);
				const widget = chatWidgetService.lastFocusedWidget;
				item = widget?.getFocus();
			}

			const requestId = isRequestVM(item) ? item.id :
				isResponseVM(item) ? item.requestId : undefined;

			if (requestId) {
				const chatService = accessor.get(IAideAgentService);
				chatService.removeRequest(item.sessionId, requestId);
			}
		}
	});
}
