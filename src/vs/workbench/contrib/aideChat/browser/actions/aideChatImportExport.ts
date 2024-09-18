/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CHAT_CATEGORY } from '../../../../../workbench/contrib/aideChat/browser/actions/aideChatActions.js';
import { IAideChatWidgetService } from '../../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditor.js';
import { AideChatEditorInput } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditorInput.js';
import { CONTEXT_CHAT_ENABLED } from '../../../../../workbench/contrib/aideChat/common/aideChatContextKeys.js';
import { isExportableSessionData } from '../../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { IAideChatService } from '../../../../../workbench/contrib/aideChat/common/aideChatService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';

const defaultFileName = 'aideChat.json';
const filters = [{ name: localize('aideChat.file.label', "Chat Session"), extensions: ['json'] }];

export function registerChatExportActions() {
	registerAction2(class ExportChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideChat.export',
				category: CHAT_CATEGORY,
				title: localize2('aideChat.export.label', "Export Chat..."),
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IAideChatWidgetService);
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const chatService = accessor.get(IAideChatService);

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
				id: 'workbench.action.aideChat.import',
				title: localize2('aideChat.import.label', "Import Chat..."),
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

				await editorService.openEditor({ resource: AideChatEditorInput.getNewEditorUri(), options: { target: { data }, pinned: true } as IChatEditorOptions });
			} catch (err) {
				throw err;
			}
		}
	});
}
