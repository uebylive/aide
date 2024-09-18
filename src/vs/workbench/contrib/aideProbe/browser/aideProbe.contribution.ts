/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import * as nls from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../../workbench/common/views.js';
import { registerProbeActions } from '../../../../workbench/contrib/aideProbe/browser/actions/aideProbeActions.js';
import { AideControls } from '../../../../workbench/contrib/aideProbe/browser/aideControls.js';
import { VIEW_ID, VIEWLET_ID } from '../../../../workbench/contrib/aideProbe/browser/aideProbe.js';
import { AideProbeDecorationService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeDecorations.js';
import { AideProbeExplanationService, IAideProbeExplanationService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeExplanations.js';
import { AideProbeService, IAideProbeService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeService.js';
import { AideProbeViewPane } from '../../../../workbench/contrib/aideProbe/browser/aideProbeView.js';
import { AideControlsService, IAideControlsService } from './aideControlsService.js';


const probeViewIcon = registerIcon('probe-view-icon', Codicon.lightbulbSparkle, nls.localize('probeViewIcon', 'View icon of the AI search view.'));

const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEWLET_ID,
	title: nls.localize2('probe', "Aide"),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
	hideIfEmpty: true,
	icon: probeViewIcon,
	order: 1,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

const viewDescriptor: IViewDescriptor = {
	id: VIEW_ID,
	containerIcon: probeViewIcon,
	name: nls.localize2('probe', "Aide"),
	ctorDescriptor: new SyncDescriptor(AideProbeViewPane),
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: viewContainer.id,
		order: 2
	},
};

// Register search default location to sidebar
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

// Register actions
registerProbeActions();

// Register services
registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Delayed);
registerSingleton(IAideProbeExplanationService, AideProbeExplanationService, InstantiationType.Delayed);
registerSingleton(IAideProbeService, AideProbeService, InstantiationType.Delayed);
registerWorkbenchContribution2(AideControls.ID, AideControls, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AideProbeDecorationService.ID, AideProbeDecorationService, WorkbenchPhase.Eventually);
