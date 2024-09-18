/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ILocalizedString, localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewExtensions } from '../../../common/views.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { IPinnedContextService, pinnedContextPaneId } from '../common/pinnedContext.js';
import { registerPinnedContextActions } from './actions/pinnedContextActions.js';
import { PinnedContextPane } from './pinnedContextPane.js';
import { PinnedContextService } from './pinnedContextService.js';

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
