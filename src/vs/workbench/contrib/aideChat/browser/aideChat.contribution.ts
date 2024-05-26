/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize2 } from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { AIDE_CHAT_VIEW_ID } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { AIDE_CHAT_SIDEBAR_PANEL_ID, AideChatViewPane } from 'vs/workbench/contrib/aideChat/browser/aideChatViewPane';

class AideChatExtensionPointHandler implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aideChatExtensionPointHandler';

	private _viewContainer: ViewContainer;

	constructor() {
		this._viewContainer = this.registerViewContainer();
		this.registerDefaultParticipantView();
	}

	private registerDefaultParticipantView(): IDisposable {
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
		const title = localize2('aideChat.viewContainer.label', "Aide");
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

registerWorkbenchContribution2(AideChatExtensionPointHandler.ID, AideChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
