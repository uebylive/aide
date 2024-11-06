/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import { IChatPlanInfo } from '../../common/aideAgentService.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { AideAgentRichItem as AideAgentRichItemContent } from './aideAgentRichItem.js';

export class PlanContentPart extends AideAgentRichItemContent {
	constructor(
		readonly plan: IChatPlanInfo,
		descriptionOrDescriptionPart: string | ChatMarkdownContentPart | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAideAgentPlanService aideAgentPlanService: IAideAgentPlanService,
		@ICommandService commandService: ICommandService
	) {

		const label = assignLabel(plan);
		const icon = assignIcon(plan);
		const menuId = assignMenuId(plan);

		super(
			label,
			icon,
			plan.isStale,
			plan.sessionId,
			plan.exchangeId,
			menuId,
			// changing this to true for now, we will change it back later on
			descriptionOrDescriptionPart,
			instantiationService,
			keybindingService,
			aideAgentPlanService,
			commandService
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
	// call everything edits
	switch (plan.state) {
		case 'Cancelled':
			return localize('agent.planCancelled', "Edits cancelled");
		case 'Accepted':
			return localize('agent.planAccepted', "Edits accepted");
		default:
			return localize('agent.edits', "Edits");
	}
}

function assignIcon(plan: IChatPlanInfo): string {
	switch (plan.state) {
		case 'Cancelled':
			return 'close';
		default:
			return 'lightbulb-sparkle';
	}
}

function assignMenuId(edits: IChatPlanInfo): MenuId | null {
	switch (edits.state) {
		case 'Started':
			return MenuId.AideAgentPlanLoading;
		case 'Complete':
			return MenuId.AideAgentEditsCompleted;
		default:
			return null;
	}
}
