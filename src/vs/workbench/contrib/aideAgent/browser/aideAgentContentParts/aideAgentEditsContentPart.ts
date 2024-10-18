/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { ChatEditsState, IChatEdits } from '../../common/aideAgentService.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { AideAgentRichItem as AideAgentRichItemContent } from './aideAgentRichItem.js';

export class EditsContentPart extends AideAgentRichItemContent {
	constructor(
		readonly edits: IChatEdits,
		descriptionPart: ChatMarkdownContentPart | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {

		const label = assignLabel(edits);
		const icon = assignIcon(edits);
		const menuId = assignMenuId(edits);

		super(
			label,
			icon,
			{ start: 0, end: 0 },
			menuId,
			edits.stale,
			descriptionPart,
			instantiationService,
			keybindingService
		);
	}

	override hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'edits' && other.state === this.edits.state && other.files?.length === this.edits.files?.length;
	}
}

function assignLabel(edits: IChatEdits): string {
	switch (edits.state) {
		case ChatEditsState.Loading:
			return localize('agent.editing', "Editing");
		case ChatEditsState.InReview:
		case ChatEditsState.MarkedComplete:
			return localize('agent.editsMade', "Edits made");
		case ChatEditsState.Cancelled:
			return localize('agent.editsCancelled', "Edits cancelled");
		default:
			throw new Error('Invalid state');
	}
}

function assignIcon(edits: IChatEdits): string {
	switch (edits.state) {
		case ChatEditsState.Loading:
		case ChatEditsState.InReview:
			return 'micro/bolt';
		case ChatEditsState.MarkedComplete:
			return 'micro/check-circle';
		case ChatEditsState.Cancelled:
			return 'micro/x-mark';
		default:
			throw new Error('Invalid state');
	}
}

function assignMenuId(edits: IChatEdits): MenuId | null {
	switch (edits.state) {
		case ChatEditsState.Loading:
			return MenuId.AideAgentEditsLoading;
		case ChatEditsState.InReview:
			return MenuId.AideAgentEditsReview;
		case ChatEditsState.MarkedComplete:
			if (edits.stale) {
				return null;
			}
			return MenuId.AideAgentEditsCompleted;
		default:
			return null;
	}
}
