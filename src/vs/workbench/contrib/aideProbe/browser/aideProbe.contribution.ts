/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import * as nls from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, IViewDescriptor, IViewsRegistry } from 'vs/workbench/common/views';
import { registerProbeActions } from 'vs/workbench/contrib/aideProbe/browser/actions/aideProbeActions';
import { AideProbeView } from 'vs/workbench/contrib/aideProbe/browser/aideProbeView';
import { VIEW_ID, VIEWLET_ID } from 'vs/workbench/contrib/aideProbe/common/aideProbe';

const probeViewIcon = registerIcon('probe-view-icon', Codicon.searchFuzzy, nls.localize('probeViewIcon', 'View icon of the AI search view.'));

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEWLET_ID,
	title: nls.localize2('probe', "Search with AI"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	icon: probeViewIcon,
	order: 1,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	containerIcon: probeViewIcon,
	name: nls.localize2('probe', "Search with AI"),
	ctorDescriptor: new SyncDescriptor(AideProbeView),
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: viewContainer.id,
		order: 1
	}
};

// Register search default location to sidebar
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

// Register actions
registerProbeActions();
