/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { ChatCodeBlockAction } from 'vs/workbench/contrib/chat/browser/actions/chatCodeblockActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ICodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ICSChatEditSessionService } from 'vs/workbench/contrib/chat/browser/csChatEdits';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatAgentEditRequest } from 'vs/workbench/contrib/chat/common/csChatAgents';
import { CONTEXT_CHAT_EDIT_RESPONSEID_IN_PROGRESS } from 'vs/workbench/contrib/chat/common/csChatContextKeys';
import { ICSChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/csChatViewModel';
import { NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export interface IChatEditConfirmationContext {
	responseId: string;
	codeblockIndex: number;
	type: 'approve' | 'reject';
	uri: URI;
}

function isEditConfirmationContext(thing: unknown): thing is IChatEditConfirmationContext {
	return typeof thing === 'object' && thing !== null && 'codeblockIndex' in thing && 'type' in thing && 'uri' in thing;
}

export function isResponseFiltered(context: ICodeBlockActionContext) {
	return isResponseVM(context.element) && context.element.errorDetails?.responseIsFiltered;
}

registerAction2(class ExportToCodebaseAction extends ChatCodeBlockAction {
	constructor() {
		super({
			id: 'workbench.action.chat.exportToCodebase',
			title: localize2('interactive.exportToCodebase.label', "Apply changes to codebase"),
			precondition: CONTEXT_PROVIDER_EXISTS,
			f1: true,
			category: CHAT_CATEGORY,
			icon: Codicon.merge,
			menu: {
				id: MenuId.ChatCodeBlock,
				group: 'navigation',
				when: CONTEXT_IN_CHAT_SESSION,
			},
			toggled: {
				condition: CONTEXT_CHAT_EDIT_RESPONSEID_IN_PROGRESS.notEqualsTo(''),
				title: 'Cancel applying changes',
				icon: Codicon.debugStop,
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
		const editorService = accessor.get(IEditorService);
		const csChatEditSessionService = accessor.get(ICSChatEditSessionService);

		if (csChatEditSessionService.activeEditResponseId) {
			// Cancel edit session
			csChatEditSessionService.cancelEdits();
			return;
		}

		if (isResponseFiltered(context)) {
			// When run from command palette
			return;
		}

		if (!isResponseVM(context.element)) {
			// When element is not a response
			return;
		}
		const responseVM: ICSChatResponseViewModel = context.element;

		if (editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
			return;
		}

		this.notifyUserAction(accessor, context);

		const editRequest: IChatAgentEditRequest = {
			sessionId: responseVM.sessionId,
			agentId: responseVM.agent?.id ?? '',
			responseId: responseVM.requestId,
			response: responseVM.response.asString(),
			context: [{
				code: context.code,
				languageId: context.languageId,
				codeBlockIndex: context.codeBlockIndex,
			}]
		};
		await csChatEditSessionService.sendEditRequest(responseVM, editRequest);
	}

	private notifyUserAction(accessor: ServicesAccessor, context: ICodeBlockActionContext) {
		if (isResponseVM(context.element)) {
			const chatService = accessor.get(IChatService);
			chatService.notifyUserAction({
				providerId: context.element.providerId,
				agentId: context.element.agent?.id,
				sessionId: context.element.sessionId,
				requestId: context.element.requestId,
				result: context.element.result,
				action: {
					kind: 'insert',
					codeBlockIndex: context.codeBlockIndex,
					totalCharacters: context.code.length,
				}
			});
		}
	}
});

export class EditConfirmationAction extends Action2 {
	static readonly ID = 'workbench.action.chat.editConfirmation';

	constructor() {
		super({
			id: EditConfirmationAction.ID,
			title: ''
		});
	}

	async run(_accessor: ServicesAccessor, ...args: any[]) {
		const chatEditSessionService = _accessor.get(ICSChatEditSessionService);
		const chatWidgetService = _accessor.get(IChatWidgetService);
		const codeEditorService = _accessor.get(ICodeEditorService);
		const commandService = _accessor.get(ICommandService);

		const context = args[0];
		if (!isEditConfirmationContext(context)) {
			return;
		}
		const { type, uri } = context;

		// Get the decorations to update
		if (type === 'approve') {
			chatEditSessionService.confirmEdits(uri);
		} else {
			chatEditSessionService.cancelEdits();
		}

		await commandService.executeCommand('_executeCodeLensProvider', uri, undefined);

		const editor = codeEditorService.getActiveCodeEditor();
		if (!editor) {
			return;
		}

		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		widget.focusInput();
		editor.focus();
	}
}
registerAction2(EditConfirmationAction);
