/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InlineChatController } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatController.js';
import * as InlineChatActions from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatActions.js';
import { CTX_INLINE_CHAT_CONFIG_TXT_BTNS, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, INLINE_CHAT_ID, InlineChatConfigKeys, MENU_INLINE_CHAT_CONTENT_STATUS, MENU_INLINE_CHAT_EXECUTE, MENU_INLINE_CHAT_WIDGET_STATUS } from '../../../../workbench/contrib/inlineAideChat/common/inlineChat.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { InlineChatNotebookContribution } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatNotebook.js';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { InlineChatSavingServiceImpl } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSavingServiceImpl.js';
import { IInlineAideChatSavingService } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSavingService.js';
import { IInlineAideChatSessionService } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSessionService.js';
import { InlineChatEnabler, InlineChatSessionServiceImpl } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSessionServiceImpl.js';
import { CancelAction, SubmitAction } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatExecuteActions.js';
import { localize } from '../../../../nls.js';
import { CONTEXT_CHAT_INPUT_HAS_TEXT } from '../../../../workbench/contrib/aideChat/common/aideChatContextKeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';


// --- browser

registerSingleton(IInlineAideChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);
registerSingleton(IInlineAideChatSavingService, InlineChatSavingServiceImpl, InstantiationType.Delayed);

registerEditorContribution(INLINE_CHAT_ID, InlineChatController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors

// --- MENU special ---

const sendActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: SubmitAction.ID,
		title: localize('edit', "Send"),
	},
	when: ContextKeyExpr.and(
		CONTEXT_CHAT_INPUT_HAS_TEXT,
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
		CTX_INLINE_CHAT_CONFIG_TXT_BTNS
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_CONTENT_STATUS, sendActionMenuItem);
MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, sendActionMenuItem);

const cancelActionMenuItem: IMenuItem = {
	group: '0_main',
	order: 0,
	command: {
		id: CancelAction.ID,
		title: localize('cancel', "Cancel Request"),
		shortTitle: localize('cancelShort', "Cancel"),
	},
	when: ContextKeyExpr.and(
		CTX_INLINE_CHAT_REQUEST_IN_PROGRESS,
	),
};

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, cancelActionMenuItem);

// --- actions ---

registerAction2(InlineChatActions.StartSessionAction);
registerAction2(InlineChatActions.CloseAction);
registerAction2(InlineChatActions.ConfigureInlineChatAction);
registerAction2(InlineChatActions.UnstashSessionAction);
registerAction2(InlineChatActions.DiscardHunkAction);
registerAction2(InlineChatActions.DiscardAction);
registerAction2(InlineChatActions.RerunAction);
registerAction2(InlineChatActions.MoveToNextHunk);
registerAction2(InlineChatActions.MoveToPreviousHunk);

registerAction2(InlineChatActions.ArrowOutUpAction);
registerAction2(InlineChatActions.ArrowOutDownAction);
registerAction2(InlineChatActions.FocusInlineChat);
registerAction2(InlineChatActions.ViewInChatAction);

registerAction2(InlineChatActions.ToggleDiffForChange);
registerAction2(InlineChatActions.AcceptChanges);

registerAction2(InlineChatActions.CopyRecordings);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, LifecyclePhase.Restored);

registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, WorkbenchPhase.AfterRestored);

// MARK - Menu Copier
// menu copier that we use for text-button mode.
// When active it filters out the send and cancel actions from the chat menu
class MenuCopier implements IDisposable {

	static Id = 'inlineAideChat.menuCopier';

	readonly dispose: () => void;

	constructor(@IConfigurationService configService: IConfigurationService,) {

		const store = new DisposableStore();
		function updateMenu() {
			if (configService.getValue<boolean>(InlineChatConfigKeys.ExpTextButtons)) {
				store.clear();
				for (const item of MenuRegistry.getMenuItems(MenuId.AideChatExecute)) {
					if (isIMenuItem(item) && (item.command.id === SubmitAction.ID || item.command.id === CancelAction.ID)) {
						continue;
					}
					store.add(MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_EXECUTE, item));
				}
			}
		}
		updateMenu();
		const listener = MenuRegistry.onDidChangeMenu(e => {
			if (e.has(MenuId.AideChatExecute)) {
				updateMenu();
			}
		});

		this.dispose = () => {
			listener.dispose();
			store.dispose();
		};
	}
}

registerWorkbenchContribution2(MenuCopier.Id, MenuCopier, WorkbenchPhase.AfterRestored);
