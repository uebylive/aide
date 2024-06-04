/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { CHAT_CATEGORY, isChatViewTitleActionContext } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatActions';
import { clearChatEditor } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatClear';
import { CHAT_VIEW_ID, IAideChatWidgetService } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { AideChatEditorInput } from 'vs/workbench/contrib/aideChat/browser/aideChatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/aideChat/browser/aideChatViewPane';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_CHAT_ENABLED, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_CHAT_HAS_REQUESTS } from 'vs/workbench/contrib/aideChat/common/aideChatContextKeys';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

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
				id: MenuId.ChatExecute,
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
