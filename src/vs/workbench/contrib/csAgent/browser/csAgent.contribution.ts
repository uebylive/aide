/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, IViewDescriptor, IViewsRegistry } from 'vs/workbench/common/views';
import { VIEWLET_ID, VIEW_ID } from 'vs/workbench/contrib/csAgent/browser/csAgent';
import { csAgentViewIcon } from 'vs/workbench/contrib/csAgent/browser/csAgentIcons';
import { CSAgentViewPane } from 'vs/workbench/contrib/csAgent/browser/csAgentViewPane';
import { ICSAgentService } from 'vs/workbench/contrib/csAgent/common/csAgentService';
import { CSAgentService } from 'vs/workbench/contrib/csAgent/common/csAgentServiceImpl';

registerSingleton(ICSAgentService, CSAgentService, InstantiationType.Delayed);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEWLET_ID,
	title: nls.localize2('aide', "Aide"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	icon: csAgentViewIcon,
	order: 100,
}, ViewContainerLocation.AuxiliaryBar);

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	containerIcon: csAgentViewIcon,
	name: nls.localize2('aide', "Aide"),
	ctorDescriptor: new SyncDescriptor(CSAgentViewPane),
	canToggleVisibility: false,
	canMoveView: false,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
