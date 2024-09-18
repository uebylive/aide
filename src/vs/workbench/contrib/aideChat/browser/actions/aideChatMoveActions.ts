/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY, isChatViewTitleActionContext } from '../../../../../workbench/contrib/aideChat/browser/actions/aideChatActions.js';
import { CHAT_VIEW_ID, IAideChatWidgetService } from '../../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditor.js';
import { AideChatEditorInput } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditorInput.js';
import { ChatViewPane } from '../../../../../workbench/contrib/aideChat/browser/aideChatViewPane.js';
import { CONTEXT_CHAT_ENABLED } from '../../../../../workbench/contrib/aideChat/common/aideChatContextKeys.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';

enum MoveToNewLocation {
	Editor = 'Editor',
	Window = 'Window'
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.aideChat.openInEditor`,
				title: localize2('aideChat.openInEditor.label', "Open Chat in Editor"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				menu: {
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					order: 0
				},
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Editor, isChatViewTitleActionContext(context) ? context.chatView : undefined);
		}
	});

	registerAction2(class GlobalMoveToNewWindowAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.aideChat.openInNewWindow`,
				title: localize2('aideChat.openInNewWindow.label', "Open Chat in New Window"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				menu: {
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					order: 0
				},
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Window, isChatViewTitleActionContext(context) ? context.chatView : undefined);
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.aideChat.openInSidebar`,
				title: localize2('aideChat.openInSidebar.label', "Open Chat in Side Bar"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				menu: [{
					id: MenuId.EditorTitle,
					order: 0,
					when: ActiveEditorContext.isEqualTo(AideChatEditorInput.EditorID),
				}]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	});
}

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation, chatView?: ChatViewPane) {
	const widgetService = accessor.get(IAideChatWidgetService);
	const viewService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);

	const widget = chatView?.widget ?? widgetService.lastFocusedWidget;
	if (!widget || !('viewId' in widget.viewContext)) {
		await editorService.openEditor({ resource: AideChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ pinned: true } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}

	const viewModel = widget.viewModel;
	if (!viewModel) {
		return;
	}

	const sessionId = viewModel.sessionId;
	const view = await viewService.openView(widget.viewContext.viewId) as ChatViewPane;
	const viewState = view.widget.getViewState();
	view.clear();

	await editorService.openEditor({ resource: AideChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId }, pinned: true, viewState: viewState } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
}

async function moveToSidebar(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const chatEditorInput = editorService.activeEditor;
	if (chatEditorInput instanceof AideChatEditorInput && chatEditorInput.sessionId) {
		await editorService.closeEditor({ editor: chatEditorInput, groupId: editorGroupService.activeGroup.id });
		const view = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
		view.loadSession(chatEditorInput.sessionId);
	} else {
		await viewsService.openView(CHAT_VIEW_ID);
	}
}
