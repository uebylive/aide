/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditor.js';
import { AideChatEditorInput } from '../../../../../workbench/contrib/aideChat/browser/aideChatEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';

export async function clearChatEditor(accessor: ServicesAccessor): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const editorGroupsService = accessor.get(IEditorGroupsService);

	const chatEditorInput = editorService.activeEditor;
	if (chatEditorInput instanceof AideChatEditorInput) {
		await editorService.replaceEditors([{
			editor: chatEditorInput,
			replacement: { resource: AideChatEditorInput.getNewEditorUri(), options: { pinned: true } satisfies IChatEditorOptions }
		}], editorGroupsService.activeGroup);
	}
}
