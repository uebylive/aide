/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import * as nls from 'vs/nls';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { registerProbeActions } from 'vs/workbench/contrib/aideProbe/browser/actions/aideProbeActions';
import { AideBar } from 'vs/workbench/contrib/aideProbe/browser/aideBar';
import { AideCommandPaletteService, IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { registerContextActions } from 'vs/workbench/contrib/aideProbe/browser/aideContextActions';
//import { AideControls } from 'vs/workbench/contrib/aideProbe/browser/aideControls';
import { AideLSPService, IAideLSPService } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { VIEW_ID, VIEWLET_ID } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeDecorationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeDecorations';
import { AideProbeExplanationService, IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { AideProbeService, IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeViewPane } from 'vs/workbench/contrib/aideProbe/browser/aideProbeView';
import 'vs/workbench/contrib/aideProbe/browser/contrib/aideToggle';

const probeViewIcon = registerIcon('probe-view-icon', Codicon.telescope, nls.localize('probeViewIcon', 'View icon of the AI search view.'));

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
	ctorDescriptor: new SyncDescriptor(AideProbeViewPane),
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: viewContainer.id,
		order: 2
	},
	when: CONTEXT_PROBE_REQUEST_STATUS.notEqualsTo('INACTIVE'),
};

// Register search default location to sidebar
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

// Register actions
registerProbeActions();
registerContextActions();

// Register services
registerSingleton(IAideProbeService, AideProbeService, InstantiationType.Delayed);
registerSingleton(IAideProbeExplanationService, AideProbeExplanationService, InstantiationType.Delayed);
registerSingleton(IAideCommandPaletteService, AideCommandPaletteService, InstantiationType.Delayed);
registerSingleton(IAideLSPService, AideLSPService, InstantiationType.Eager);
registerWorkbenchContribution2(AideProbeDecorationService.ID, AideProbeDecorationService, WorkbenchPhase.Eventually);
//registerWorkbenchContribution2(AideControls.ID, AideControls, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AideBar.ID, AideBar, WorkbenchPhase.Eventually);
