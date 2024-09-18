/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY, isChatViewTitleActionContext } from '../../../../../workbench/contrib/aideChat/browser/actions/aideChatActions.js';
import { clearChatEditor } from '../../../../../workbench/contrib/aideChat/browser/actions/aideChatClear.js';
import { CHAT_VIEW_ID, IAideChatWidgetService } from '../../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { AideChatEditorInput } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditorInput.js';
import { ChatViewPane } from '../../../../../workbench/contrib/aideChat/browser/aideChatViewPane.js';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_CHAT_HAS_REQUESTS } from '../../../../../workbench/contrib/aideChat/common/aideChatContextKeys.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';

export const ACTION_ID_NEW_CHAT = `workbench.action.aideChat.newChat`;

export class ClearChatEditorAction extends Action2 {
	static readonly ID = 'workbench.action.aideChatEditor.clearChat';

	constructor() {
		super({
			id: ClearChatEditorAction.ID,
			title: localize2('aideChat.clearChat.label', "Clear"),
			f1: false,
			precondition: CONTEXT_CHAT_ENABLED,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KeyL
				},
				when: CONTEXT_IN_CHAT_SESSION
			},
			menu: [{
				id: MenuId.AideChatExecute,
				when: ContextKeyExpr.and(CONTEXT_IN_CHAT_SESSION, CONTEXT_CHAT_HAS_REQUESTS, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
				group: 'navigation',
				order: -1
			}]
		});
	}
	async run(accessor: ServicesAccessor, ...args: any[]) {
		const widgetService = accessor.get(IAideChatWidgetService);

		const widget = widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		announceChatCleared(accessor.get(IAccessibilitySignalService));
		widget.clear();
		widget.focusInput();
	}
}

export function registerNewChatActions() {
	registerAction2(ClearChatEditorAction);

	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideChatEditor.newChat',
				title: localize2('aideChat.newChat.label', "New Chat"),
				icon: Codicon.plus,
				f1: false,
				precondition: CONTEXT_CHAT_ENABLED,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(AideChatEditorInput.EditorID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			announceChatCleared(accessor.get(IAccessibilitySignalService));
			await clearChatEditor(accessor);
		}
	});

	registerAction2(class GlobalClearChatAction extends Action2 {
		constructor() {
			super({
				id: ACTION_ID_NEW_CHAT,
				title: localize2('aideChat.newChat.label', "New Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					},
					when: CONTEXT_IN_CHAT_SESSION
				},
				menu: [{
					id: MenuId.AideChatContext,
					group: 'z_clear'
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					group: 'navigation',
					order: -1
				}]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
			if (isChatViewTitleActionContext(context)) {
				// Is running in the Chat view title
				announceChatCleared(accessibilitySignalService);
				context.chatView.clear();
				context.chatView.widget.focusInput();
			} else {
				// Is running from f1 or keybinding
				const widgetService = accessor.get(IAideChatWidgetService);
				const viewsService = accessor.get(IViewsService);

				let widget = widgetService.lastFocusedWidget;
				if (!widget) {
					const chatView = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
					widget = chatView.widget;
				}

				announceChatCleared(accessibilitySignalService);
				widget.clear();
				widget.focusInput();
			}
		}
	});
}

function announceChatCleared(accessibilitySignalService: IAccessibilitySignalService): void {
	accessibilitySignalService.playSignal(AccessibilitySignal.clear);
}
