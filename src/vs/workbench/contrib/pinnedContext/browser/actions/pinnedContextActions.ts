/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IPinnedContextService } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';
import { CONTEXT_HAS_PINNED_CONTEXT } from 'vs/workbench/contrib/pinnedContext/common/pinnedContextContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const PINNED_CONTEXT_CATEGORY = localize2('pinnedContext.category', "Pinned Context");

const clearPinnedContextIcon = registerIcon('clear-pinned-context', Codicon.clearAll, localize('clearPinnedContextIcon', 'Icon for the clear pinned context action.'));

class PinFileToContext extends Action2 {
	static readonly ID = 'workbench.action.pinFileToContext';

	constructor() {
		super({
			id: PinFileToContext.ID,
			title: localize2('pinnedContext.pinFile', "Pin File to Context"),
			category: PINNED_CONTEXT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const pinnedContextService = accessor.get(IPinnedContextService);
		const editorService = accessor.get(IEditorService);

		const activeEditor = editorService.activeEditor;
		if (activeEditor && activeEditor.resource) {
			pinnedContextService.addContext(activeEditor.resource);
		}
	}
}

class UnpinFileFromContext extends Action2 {
	static readonly ID = 'workbench.action.unpinFileFromContext';

	constructor() {
		super({
			id: UnpinFileFromContext.ID,
			title: localize2('pinnedContext.unpinFile', "Unpin File from Context"),
			category: PINNED_CONTEXT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const pinnedContextService = accessor.get(IPinnedContextService);
		const editorService = accessor.get(IEditorService);

		const activeEditor = editorService.activeEditor;
		if (activeEditor && activeEditor.resource) {
			pinnedContextService.removeContext(activeEditor.resource);
		}
	}
}

class ClearPinnedContext extends Action2 {
	static readonly ID = 'workbench.action.clearPinnedContext';

	constructor() {
		super({
			id: ClearPinnedContext.ID,
			title: localize2('pinnedContext.clear', "Clear Pinned Context"),
			category: PINNED_CONTEXT_CATEGORY,
			f1: true,
			icon: clearPinnedContextIcon,
			precondition: CONTEXT_HAS_PINNED_CONTEXT,
			menu: {
				id: MenuId.PinnedContextTitle,
				group: 'navigation',
				order: 1,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const pinnedContextService = accessor.get(IPinnedContextService);
		pinnedContextService.clearContexts();
	}
}

export function registerPinnedContextActions() {
	registerAction2(PinFileToContext);
	registerAction2(UnpinFileFromContext);
	registerAction2(ClearPinnedContext);
}
