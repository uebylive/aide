/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { registerPinnedContextActions } from 'vs/workbench/contrib/pinnedContext/browser/actions/pinnedContextActions';
import { PinnedContextPane } from 'vs/workbench/contrib/pinnedContext/browser/pinnedContextPane';
import { PinnedContextService } from 'vs/workbench/contrib/pinnedContext/browser/pinnedContextService';
import { IPinnedContextService, pinnedContextPaneId } from 'vs/workbench/contrib/pinnedContext/common/pinnedContext';

const pinnedContextIcon = registerIcon('pinned-context-view-icon', Codicon.pinned, localize('pinnedContextViewIcon', 'View icon of the pinned context view.'));

export class PinnedContextPaneDescriptor implements IViewDescriptor {
	readonly id = pinnedContextPaneId;
	readonly name: ILocalizedString = PinnedContextPane.TITLE;
	readonly containerIcon = pinnedContextIcon;
	readonly ctorDescriptor = new SyncDescriptor(PinnedContextPane);
	readonly order = 1;
	readonly weight = 100;
	readonly collapsed = false;
	readonly canToggleVisibility = false;
	readonly hideByDefault = false;
	readonly canMoveView = false;
}

// Register the pinned context view
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([new PinnedContextPaneDescriptor()], VIEW_CONTAINER);

// Register actions
registerPinnedContextActions();

// Register services
registerSingleton(IPinnedContextService, PinnedContextService, InstantiationType.Delayed);
