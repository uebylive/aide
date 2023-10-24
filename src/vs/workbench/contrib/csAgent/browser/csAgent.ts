/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICSAgentViewModel } from 'vs/workbench/contrib/csAgent/common/csAgentViewModel';

export const VIEWLET_ID = 'workbench.viewlet.csAgent';
export const PANEL_ID = 'workbench.panel.csAgentAuxiliaryBar';
export const VIEW_ID = 'workbench.view.csAgent';

export interface ICSAgentWidget {
	readonly viewModel: ICSAgentViewModel | undefined;
}
