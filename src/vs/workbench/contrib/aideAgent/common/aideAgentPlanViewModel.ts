/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAideAgentPlanProgressMessage } from './aideAgentService.js';

export interface AideAgentPlanTreeItem {
	readonly id: string;
	readonly progressMessages: ReadonlyArray<IAideAgentPlanProgressMessage>;
	readonly isComplete: boolean;
	currentRenderedHeight: number | undefined;
}
