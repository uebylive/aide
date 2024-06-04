/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatEditor';
import { AideChatEditorInput } from 'vs/workbench/contrib/aideChat/browser/aideChatEditorInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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
