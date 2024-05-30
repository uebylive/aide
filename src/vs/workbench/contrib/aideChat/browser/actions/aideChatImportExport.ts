/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { joinPath } from 'vs/base/common/resources';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { IChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/aideChat/browser/aideChatEditorInput';
import { CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/aideChat/common/aideChatContextKeys';
import { isExportableSessionData } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const defaultFileName = 'chat.json';
const filters = [{ name: localize('chat.file.label', "Chat Session"), extensions: ['json'] }];

export function registerChatExportActions() {
	registerAction2(class ExportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.export',
				category: CHAT_CATEGORY,
				title: localize2('chat.export.label', "Export Chat..."),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const chatService = accessor.get(IChatService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return;
			}

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showSaveDialog({
				defaultUri,
				filters
			});
			if (!result) {
				return;
			}

			const model = chatService.getSession(widget.viewModel.sessionId);
			if (!model) {
				return;
			}

			// Using toJSON on the model
			const content = VSBuffer.fromString(JSON.stringify(model.toExport(), undefined, 2));
			await fileService.writeFile(result, content);
		}
	});

	registerAction2(class ImportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.import',
				title: localize2('chat.import.label', "Import Chat..."),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const editorService = accessor.get(IEditorService);

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
			const result = await fileDialogService.showOpenDialog({
				defaultUri,
				canSelectFiles: true,
				filters
			});
			if (!result) {
				return;
			}

			const content = await fileService.readFile(result[0]);
			try {
				const data = JSON.parse(content.value.toString());
				if (!isExportableSessionData(data)) {
					throw new Error('Invalid chat session data');
				}

				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { target: { data }, pinned: true } as IChatEditorOptions });
			} catch (err) {
				throw err;
			}
		}
	});
}
