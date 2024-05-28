/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { AIDE_CHAT_VIEW_ID } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { AideChatEditor, IAideChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatEditor';
import { AideChatEditorInput, AideChatEditorInputSerializer } from 'vs/workbench/contrib/aideChat/browser/aideChatEditorInput';
import { AIDE_CHAT_SIDEBAR_PANEL_ID, AideChatViewPane } from 'vs/workbench/contrib/aideChat/browser/aideChatViewPane';
import { IAideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { AideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatServiceImpl';
import { AideChatWidgetHistoryService, IAideChatWidgetHistoryService } from 'vs/workbench/contrib/aideChat/common/aideChatWidgetHistoryService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'aideChat',
	title: nls.localize('aideChatConfigurationTitle', "Aide"),
	type: 'object',
	properties: {
		'aideChat.editor.fontSize': {
			type: 'number',
			description: nls.localize('aideChat.editor.fontSize', "Controls the font size in pixels in Aide chat codeblocks."),
			default: isMacintosh ? 12 : 14,
		},
		'aideChat.editor.fontFamily': {
			type: 'string',
			description: nls.localize('aideChat.editor.fontFamily', "Controls the font family in Aide chat codeblocks."),
			default: 'default'
		},
		'aideChat.editor.fontWeight': {
			type: 'string',
			description: nls.localize('aideChat.editor.fontWeight', "Controls the font weight in Aide chat codeblocks."),
			default: 'default'
		},
		'aideChat.editor.wordWrap': {
			type: 'string',
			description: nls.localize('aideChat.editor.wordWrap', "Controls whether lines should wrap in Aide chat codeblocks."),
			default: 'off',
			enum: ['on', 'off']
		},
		'aideChat.editor.lineHeight': {
			type: 'number',
			description: nls.localize('aideChat.editor.lineHeight', "Controls the line height in pixels in Aide chat codeblocks. Use 0 to compute the line height from the font size."),
			default: 0
		},
	}
});

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AideChatEditor,
		AideChatEditorInput.EditorID,
		nls.localize('aideChat', "Aide")
	),
	[
		new SyncDescriptor(AideChatEditorInput)
	]
);

class AideChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.aideChatResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeAideChatSesssion}:**/**`,
			{
				id: AideChatEditorInput.EditorID,
				label: nls.localize('aideChat', "Aide"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeAideChatSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(AideChatEditorInput, resource, options as IAideChatEditorOptions), options };
				}
			}
		));
	}
}

class AideChatExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aideChatExtensionPointHandler';

	private _viewContainer: ViewContainer;

	constructor() {
		this._viewContainer = this.registerViewContainer();
		this.registerDefaultView();
	}

	private registerDefaultView(): IDisposable {
		const name = 'Aide';
		const viewDescriptor: IViewDescriptor[] = [{
			id: AIDE_CHAT_VIEW_ID,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			singleViewPaneContainerTitle: this._viewContainer.title.value,
			name: { value: name, original: name },
			canToggleVisibility: false,
			canMoveView: true,
			ctorDescriptor: new SyncDescriptor(AideChatViewPane),
		}];
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, this._viewContainer);

		return toDisposable(() => {
			Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews(viewDescriptor, this._viewContainer);
		});
	}

	private registerViewContainer(): ViewContainer {
		// Register View Container
		const title = nls.localize2('aideChat.viewContainer.label', "Aide");
		const icon = Codicon.wand;
		const viewContainerId = AIDE_CHAT_SIDEBAR_PANEL_ID;
		const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: viewContainerId,
			title,
			icon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [viewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: viewContainerId,
			hideIfEmpty: true,
			order: 100,
		}, ViewContainerLocation.AuxiliaryBar);

		return viewContainer;
	}
}

registerWorkbenchContribution2(AideChatResolverContribution.ID, AideChatResolverContribution, WorkbenchPhase.BlockStartup);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(AideChatEditorInput.TypeID, AideChatEditorInputSerializer);
registerWorkbenchContribution2(AideChatExtensionPointHandler.ID, AideChatExtensionPointHandler, WorkbenchPhase.BlockStartup);

registerSingleton(IAideChatService, AideChatService, InstantiationType.Delayed);
registerSingleton(IAideChatWidgetHistoryService, AideChatWidgetHistoryService, InstantiationType.Delayed);
