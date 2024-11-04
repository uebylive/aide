/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { PLAN_REVIEW_PANEL_ID, PlanReviewPane } from './aideAgentPlanReviewViewPane.js';

const viewContainerId = PLAN_REVIEW_PANEL_ID;

export function registerPlanReviewViewAndViewContainer() {
	const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
		id: viewContainerId,
		title: localize2('chat.viewContainer.label', "Review plan"), // Should be dinamically changed
		icon: Codicon.mapVertical,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [viewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: viewContainerId,
		hideIfEmpty: false,
		order: 5,
	}, ViewContainerLocation.Sidebar);


	const name = 'Aide';
	const viewDescriptor: IViewDescriptor[] = [{
		id: PLAN_REVIEW_PANEL_ID,
		containerIcon: viewContainer.icon,
		containerTitle: viewContainer.title.value,
		singleViewPaneContainerTitle: viewContainer.title.value,
		name: { value: name, original: name },
		canToggleVisibility: false,
		canMoveView: false,
		ctorDescriptor: new SyncDescriptor(PlanReviewPane),
		// when: // Add context key to show panel when we are reviewing
	}];

	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, viewContainer);

}
