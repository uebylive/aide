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
import { ChatEditsState, IChatEditsInfo } from '../../common/aideAgentService.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { AideAgentRichItem as AideAgentRichItemContent } from './aideAgentRichItem.js';

export class EditsContentPart extends AideAgentRichItemContent {
	constructor(
		readonly edits: IChatEditsInfo,
		descriptionOrDescriptionPart: string | ChatMarkdownContentPart | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAideAgentPlanService aideAgentPlanService: IAideAgentPlanService,
		@ICommandService commandService: ICommandService
	) {

		const label = assignLabel(edits);
		const icon = assignIcon(edits);
		const menuId = assignMenuId(edits);

		super(
			label,
			icon,
			edits.isStale,
			edits.sessionId,
			edits.exchangeId,
			menuId,
			descriptionOrDescriptionPart,
			instantiationService,
			keybindingService,
			aideAgentPlanService,
			commandService
		);
	}

	override hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'editsInfo'
			&& other.state === this.edits.state
			&& other.files?.length === this.edits.files?.length
			&& other.isStale === this.edits.isStale
			&& other.description === this.edits.description;
	}
}

function assignLabel(edits: IChatEditsInfo): string {
	switch (edits.state) {
		case ChatEditsState.Loading:
		case ChatEditsState.MarkedComplete:
			return localize('agent.edits', "Edits");
		case ChatEditsState.Cancelled:
			return localize('agent.editsCancelled', "Edits cancelled");
		default:
			throw new Error('Invalid state');
	}
}

function assignIcon(edits: IChatEditsInfo): string {
	switch (edits.state) {
		case ChatEditsState.Loading:
			return 'lightbulb-sparkle';
		case ChatEditsState.MarkedComplete:
			return 'checklist';
		case ChatEditsState.Cancelled:
			return 'close';
		default:
			throw new Error('Invalid state');
	}
}

function assignMenuId(edits: IChatEditsInfo): MenuId | null {
	switch (edits.state) {
		case ChatEditsState.Loading:
			return MenuId.AideAgentEditsLoading;
		case ChatEditsState.MarkedComplete:
			return MenuId.AideAgentEditsCompleted;
		default:
			return null;
	}
}
