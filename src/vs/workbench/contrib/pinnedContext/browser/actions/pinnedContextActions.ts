/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/model';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorResourceAccessor, isEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IPinnedContextService, MANAGE_PINNED_CONTEXT, PinnedContextItem } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';
import { CONTEXT_HAS_PINNED_CONTEXT } from 'vs/workbench/contrib/pinnedContext/common/pinnedContextContextKeys';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { ISearchService } from 'vs/workbench/services/search/common/search';

const PINNED_CONTEXT_CATEGORY = localize2('pinnedContext.category', "Pinned Context");

const clearPinnedContextIcon = registerIcon('clear-pinned-context', Codicon.clearAll, localize('clearPinnedContextIcon', 'Icon for the clear pinned context action.'));

const createQuickPickItem = (resourceOrEditor: URI | EditorInput | IResourceEditorInput, labelService: ILabelService, modelService: IModelService, languageService: ILanguageService) => {
	let resource: URI | undefined;
	if (isEditorInput(resourceOrEditor)) {
		resource = EditorResourceAccessor.getOriginalUri(resourceOrEditor);
	} else {
		resource = URI.isUri(resourceOrEditor) ? resourceOrEditor : resourceOrEditor.resource;
	}

	if (!resource) {
		throw new Error('Invalid resource');
	}

	const iconClassesValue = new Lazy(() => getIconClasses(modelService, languageService, resource, undefined, undefined));

	return <IQuickPickItem & PinnedContextItem>{
		uri: resource,
		label: basenameOrAuthority(resource),
		description: labelService.getUriLabel(dirname(resource), { relative: true }),
		get iconClasses() { return iconClassesValue.value; },
	};
};

CommandsRegistry.registerCommand(MANAGE_PINNED_CONTEXT, async (accessor) => {
	const contextService = accessor.get(IWorkspaceContextService);
	const historyService = accessor.get(IHistoryService);
	const instantiationService = accessor.get(IInstantiationService);
	const labelService = accessor.get(ILabelService);
	const languageService = accessor.get(ILanguageService);
	const modelService = accessor.get(IModelService);
	const pinnedContextService = accessor.get(IPinnedContextService);
	const quickInputService = accessor.get(IQuickInputService);
	const searchService = accessor.get(ISearchService);

	const disposables = new DisposableStore();
	const cancellationTokenCts = disposables.add(new CancellationTokenSource());
	const fileQueryBuilder = instantiationService.createInstance(QueryBuilder);

	const picker = disposables.add(quickInputService.createQuickPick<IQuickPickItem & PinnedContextItem>());
	picker.items = historyService.getHistory().map(editor => createQuickPickItem(editor, labelService, modelService, languageService));
	picker.canSelectMany = true;
	picker.hideCheckAll = true;
	picker.placeholder = localize('pinnedContext.placeholder', "Select files to pin as context (press space to toggle)");
	picker.selectedItems = picker.items.filter(item => {
		const pickerItem = item as PinnedContextItem;
		return pinnedContextService.hasContext(pickerItem.uri);
	}) as (IQuickPickItem & PinnedContextItem)[];
	picker.onDidChangeValue(async (query) => {
		const files = await searchService.fileSearch(
			fileQueryBuilder.file(
				contextService.getWorkspace().folders,
				{
					extraFileResources: instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
					filePattern: query || '',
					sortByScore: true,
					maxResults: 512,
				}
			),
			cancellationTokenCts.token
		);
		picker.items = files.results.map(result => createQuickPickItem(result.resource, labelService, modelService, languageService));
	});

	picker.show();

	disposables.add(picker.onDidAccept(() => {
		const selectedItems = picker.selectedItems;
		pinnedContextService.setContexts(selectedItems.map(item => URI.file(item.label)));

		picker.hide();
		disposables.dispose();
	}));

	disposables.add(picker.onDidHide(() => {
		disposables.dispose();
	}));
});

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

class ManagePinnedContext extends Action2 {
	static readonly ID = 'workbench.action.managePinnedContext';

	constructor() {
		super({
			id: ManagePinnedContext.ID,
			title: localize2('pinnedContext.manage', "Manage Pinned Context"),
			category: PINNED_CONTEXT_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		commandService.executeCommand(MANAGE_PINNED_CONTEXT);
	}
}

export function registerPinnedContextActions() {
	registerAction2(PinFileToContext);
	registerAction2(UnpinFileFromContext);
	registerAction2(ClearPinnedContext);
	registerAction2(ManagePinnedContext);
}
