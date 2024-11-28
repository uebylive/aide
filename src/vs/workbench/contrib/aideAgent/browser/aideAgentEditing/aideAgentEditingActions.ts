/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/aideAgentContextKeys.js';
import { applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, WorkingSetEntryState } from '../../common/aideAgentEditingService.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { isRequestVM, isResponseVM } from '../../common/aideAgentViewModel.js';
import { CHAT_CATEGORY } from '../actions/aideAgentActions.js';
import { ChatTreeItem, IChatWidget, IAideAgentWidgetService } from '../aideAgent.js';

abstract class WorkingSetAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: any[]) {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IAideAgentWidgetService).lastFocusedWidget;

		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		return this.runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris);
	}

	abstract runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget | undefined, ...uris: URI[]): any;
}

registerAction2(class OpenFileInDiffAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.openFileInDiff',
			title: localize2('open.fileInDiff', 'Open Changes in Diff Editor'),
			icon: Codicon.diffSingle,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 2,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, _chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		for (const uri of uris) {
			const editedFile = currentEditingSession.entries.get().find((e) => e.modifiedURI.toString() === uri.toString());
			if (editedFile?.state.get() === WorkingSetEntryState.Modified) {
				await editorService.openEditor({
					original: { resource: URI.from(editedFile.originalURI, true) },
					modified: { resource: URI.from(editedFile.modifiedURI, true) },
				});
			} else {
				await editorService.openEditor({ resource: uri });
			}
		}
	}
});

registerAction2(class AcceptAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.acceptFile',
			title: localize2('accept.file', 'Accept'),
			icon: Codicon.check,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 0,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		await currentEditingSession.accept(...uris);
	}
});

registerAction2(class DiscardAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.discardFile',
			title: localize2('discard.file', 'Discard'),
			icon: Codicon.discard,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 2,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 1,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		await currentEditingSession.reject(...uris);
	}
});

export class ChatEditingAcceptAllAction extends Action2 {

	constructor() {
		super({
			id: 'chatEditing.acceptAllFiles',
			title: localize('accept', 'Accept'),
			icon: Codicon.check,
			tooltip: localize('acceptAllEdits', 'Accept All Edits'),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
					id: MenuId.EditorTitle,
					order: 0,
					group: 'navigation',
				},
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), hasUndecidedChatEditingResourceContextKey)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.accept();
	}
}
registerAction2(ChatEditingAcceptAllAction);

export class ChatEditingDiscardAllAction extends Action2 {

	constructor() {
		super({
			id: 'chatEditing.discardAllFiles',
			title: localize('discard', 'Discard'),
			icon: Codicon.discard,
			tooltip: localize('discardAllEdits', 'Discard All Edits'),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
			menu: [
				{
					when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
					id: MenuId.EditorTitle,
					order: 1,
					group: 'navigation',
				},
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), hasUndecidedChatEditingResourceContextKey)
				}
			],
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput, ChatContextKeys.inputHasText.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const dialogService = accessor.get(IDialogService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		// Ask for confirmation if there are any edits
		const entries = currentEditingSession.entries.get();
		if (entries.length > 0) {
			const confirmation = await dialogService.confirm({
				title: localize('chat.editing.discardAll.confirmation.title', "Discard all edits?"),
				message: entries.length === 1
					? localize('chat.editing.discardAll.confirmation.oneFile', "This will undo changes made by {0} in {1}. Do you want to proceed?", 'Copilot Edits', basename(entries[0].modifiedURI))
					: localize('chat.editing.discardAll.confirmation.manyFiles', "This will undo changes made by {0} in {1} files. Do you want to proceed?", 'Copilot Edits', entries.length),
				primaryButton: localize('chat.editing.discardAll.confirmation.primaryButton', "Yes"),
				type: 'info'
			});
			if (!confirmation.confirmed) {
				return;
			}
		}

		await currentEditingSession.reject();
	}
}
registerAction2(ChatEditingDiscardAllAction);

export class ChatEditingShowChangesAction extends Action2 {
	static readonly ID = 'chatEditing.viewChanges';
	static readonly LABEL = localize('chatEditing.viewChanges', 'View All Edits');

	constructor() {
		super({
			id: ChatEditingShowChangesAction.ID,
			title: ChatEditingShowChangesAction.LABEL,
			tooltip: ChatEditingShowChangesAction.LABEL,
			f1: false,
			icon: Codicon.diffMultiple,
			precondition: hasUndecidedChatEditingResourceContextKey,
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey))
				}
			],
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.show();
	}
}
registerAction2(ChatEditingShowChangesAction);

registerAction2(class RemoveAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.undoEdits',
			title: localize2('chat.undoEdits.label', "Undo Edits"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.x,
			keybinding: {
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		let item: ChatTreeItem | undefined = args[0];
		if (!isResponseVM(item) && !isRequestVM(item)) {
			const chatWidgetService = accessor.get(IAideAgentWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		const chatService = accessor.get(IAideAgentService);
		const chatModel = chatService.getSession(item.sessionId);

		const requestId = isRequestVM(item) ? item.id :
			isResponseVM(item) ? item.requestId : undefined;

		if (requestId) {
			const configurationService = accessor.get(IConfigurationService);
			const dialogService = accessor.get(IDialogService);
			const chatEditingService = accessor.get(IChatEditingService);
			const chatRequests = chatModel.getRequests();
			const itemIndex = chatRequests.findIndex(request => request.id === requestId);
			const editsToUndo = chatRequests.length - itemIndex;

			const requestsToRemove = chatRequests.slice(itemIndex);
			const requestIdsToRemove = new Set(requestsToRemove.map(request => request.id));
			const entriesModifiedInRequestsToRemove = chatEditingService.currentEditingSessionObs.get()?.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
			const shouldPrompt = entriesModifiedInRequestsToRemove.length > 0 && configurationService.getValue('chat.editing.confirmEditRequestRemoval') === true;

			let message: string;
			if (editsToUndo === 1) {
				if (entriesModifiedInRequestsToRemove.length === 1) {
					message = localize('chat.removeLast.confirmation.message2', "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
				} else {
					message = localize('chat.removeLast.confirmation.multipleEdits.message', "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
				}
			} else {
				if (entriesModifiedInRequestsToRemove.length === 1) {
					message = localize('chat.remove.confirmation.message2', "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
				} else {
					message = localize('chat.remove.confirmation.multipleEdits.message', "This will remove all subsequent requests and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
				}
			}

			const confirmation = shouldPrompt
				? await dialogService.confirm({
					title: editsToUndo === 1
						? localize('chat.removeLast.confirmation.title', "Do you want to undo your last edit?")
						: localize('chat.remove.confirmation.title', "Do you want to undo {0} edits?", editsToUndo),
					message: message,
					primaryButton: localize('chat.remove.confirmation.primaryButton', "Yes"),
					checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
					type: 'info'
				})
				: { confirmed: true };

			if (!confirmation.confirmed) {
				return;
			}

			if (confirmation.checkboxChecked) {
				await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
			}

			// Restore the snapshot to what it was before the request(s) that we deleted
			const snapshotRequestId = chatRequests[itemIndex].id;
			await chatEditingService.restoreSnapshot(snapshotRequestId);

			// Remove the request and all that come after it
			for (const request of requestsToRemove) {
				await chatService.removeRequest(item.sessionId, request.id);
			}
		}
	}
});

registerAction2(class OpenWorkingSetHistoryAction extends Action2 {

	static readonly id = 'chat.openFileSnapshot';
	constructor() {
		super({
			id: OpenWorkingSetHistoryAction.id,
			title: localize('chat.openSnapshot.label', "Open File Snapshot"),
			menu: [{
				id: MenuId.ChatEditingCodeBlockContext,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.notIn(ChatContextKeys.itemId.key, ChatContextKeys.lastItemId.key),
			},]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const context: { sessionId: string; requestId: string; uri: URI } | undefined = args[0];
		if (!context?.sessionId) {
			return;
		}

		const chatService = accessor.get(IAideAgentService);
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const chatModel = chatService.getSession(context.sessionId);
		const requests = chatModel?.getExchanges();
		if (!requests) {
			return;
		}
		const snapshotRequestIndex = requests?.findIndex((v, i) => i > 0 && requests[i - 1]?.id === context.requestId);
		if (snapshotRequestIndex < 1) {
			return;
		}
		const snapshotRequestId = requests[snapshotRequestIndex]?.id;
		if (snapshotRequestId) {
			const snapshot = chatEditingService.getSnapshotUri(snapshotRequestId, context.uri);
			if (snapshot) {
				const editor = await editorService.openEditor({ resource: snapshot, label: localize('chatEditing.snapshot', '{0} (Snapshot {1})', basename(context.uri), snapshotRequestIndex - 1), options: { transient: true, activation: EditorActivation.ACTIVATE } });
				if (isCodeEditor(editor)) {
					editor.updateOptions({ readOnly: true });
				}
			}
		}
	}
});
