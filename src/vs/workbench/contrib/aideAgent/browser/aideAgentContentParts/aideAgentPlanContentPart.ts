/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import { IChatPlanInfo } from '../../common/aideAgentService.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { AideAgentRichItem as AideAgentRichItemContent, IActionsPreviewOptions } from './aideAgentRichItem.js';

export class PlanContentPart extends AideAgentRichItemContent {
	constructor(
		readonly plan: IChatPlanInfo,
		sessionId: string,
		exchangeId: string,
		descriptionPart: ChatMarkdownContentPart | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAideAgentPlanService aideAgentPlanService: IAideAgentPlanService,
	) {

		const label = assignLabel(plan);
		const icon = assignIcon(plan);
		const { menuId, previewOptions } = assignMenuAndPreviewOptions(plan);

		super(
			label,
			icon,
			plan.isStale,
			sessionId,
			exchangeId,
			menuId,
			// changing this to true for now, we will change it back later on
			true,
			previewOptions,
			descriptionPart,
			instantiationService,
			keybindingService,
			aideAgentPlanService,
		);
	}

	override hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'planInfo'
			&& other.state === this.plan.state
			&& other.isStale === this.plan.isStale
			&& other.description === this.plan.description;
	}
}

function assignLabel(plan: IChatPlanInfo): string {
	switch (plan.state) {
		case 'started':
			return localize('agent.planStarted', "Started Planning");
		case 'Complete':
			return localize('agent.planComplete', "Planning Complete");
		case 'cancelled':
			return localize('agent.planCancelled', "Plan Cancelled");
		default:
			throw new Error('Invalid state');
	}
}

function assignIcon(plan: IChatPlanInfo): string {
	switch (plan.state) {
		case 'started':
			return 'micro/bolt';
		case 'Complete':
			return 'micro/check-circle';
		case 'cancelled':
			return 'micro/x-mark';
		default:
			throw new Error('Invalid state');
	}
}

function assignMenuAndPreviewOptions(edits: IChatPlanInfo): { menuId: MenuId | null; previewOptions: IActionsPreviewOptions } {
	let menuId = null;
	let previewOptions: IActionsPreviewOptions = { start: -1, end: -1 };

	const startLabel: string = 'Planning';

	switch (edits.state) {
		case 'started':
			menuId = MenuId.AideAgentPlanLoading;
			previewOptions = { startLabel, start: -2, end: -1 };
			break;
		case 'Complete':
			menuId = MenuId.AideAgentPlanReview;
			previewOptions = { startLabel, start: -2, end: -1 };
			break;
		case 'cancelled':
			menuId = MenuId.AideAgentEditsCompleted;
			break;
		default:
			break;
	}
	return { menuId, previewOptions };
}
