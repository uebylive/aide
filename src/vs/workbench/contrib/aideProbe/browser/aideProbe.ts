/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AideProbeViewPane } from 'vs/workbench/contrib/aideProbe/browser/aideProbeView';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export const VIEWLET_ID = 'workbench.view.aideProbe';
export const VIEW_ID = 'workbench.view.aideProbe';

export async function showProbeView(viewsService: IViewsService): Promise<AideProbeViewPane | null> {
	return (await viewsService.openView<AideProbeViewPane>(VIEW_ID));
}

export function clearProbeView(viewsService: IViewsService, showWelcome?: boolean): void {
	const view = viewsService.getViewWithId<AideProbeViewPane>(VIEW_ID);
	if (view) {
		view.clear(showWelcome);
	}
}
