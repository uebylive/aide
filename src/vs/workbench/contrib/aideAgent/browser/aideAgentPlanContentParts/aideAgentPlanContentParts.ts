/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatRendererContent } from '../../common/aideAgentViewModel.js';
import { AideAgentPlanTreeItem } from '../aideAgentPlan.js';

export interface IAideAgentPlanContentPart extends IDisposable {
	domNode: HTMLElement;
	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: AideAgentPlanTreeItem): boolean;
}

export interface IAideAgentPlanContentPartRenderContext {
	element: AideAgentPlanTreeItem;
	index: number;
	content: ReadonlyArray<IChatRendererContent>;
	preceedingContentParts: ReadonlyArray<IAideAgentPlanContentPart>;
}
