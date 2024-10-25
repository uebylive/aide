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
import { ChatEditsState, IChatEditsInfo } from '../../common/aideAgentService.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { AideAgentRichItem as AideAgentRichItemContent, IActionsPreviewOptions } from './aideAgentRichItem.js';

export class EditsContentPart extends AideAgentRichItemContent {
	constructor(
		readonly edits: IChatEditsInfo,
		sessionId: string,
		exchangeId: string,
		descriptionPart: ChatMarkdownContentPart | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IAideAgentPlanService aideAgentPlanService: IAideAgentPlanService,
	) {

		const label = assignLabel(edits);
		const icon = assignIcon(edits);
		const { menuId, previewOptions } = assignMenuAndPreviewOptions(edits);

		super(
			label,
			icon,
			edits.isStale,
			sessionId,
			exchangeId,
			menuId,
			edits.state === ChatEditsState.MarkedComplete,
			previewOptions,
			descriptionPart,
			instantiationService,
			keybindingService,
			aideAgentPlanService,
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

function assignIcon(edits: IChatEditsInfo): string {
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

function assignMenuAndPreviewOptions(edits: IChatEditsInfo): { menuId: MenuId | null; previewOptions: IActionsPreviewOptions } {
	let menuId = null;
	let previewOptions: IActionsPreviewOptions = { start: -1, end: -1 };

	let startLabel: string | undefined;
	if (edits.files.length === 1) {
		startLabel = localize('editedFile', "{0} file edited", edits.files.length);
	} else if (edits.files.length > 1) {
		startLabel = localize('editedFiles', "{0} files edited", edits.files.length);
	}

	switch (edits.state) {
		case ChatEditsState.Loading:
			menuId = MenuId.AideAgentEditsLoading;
			previewOptions = { startLabel, start: -2, end: -1 };
			break;
		case ChatEditsState.InReview:
			menuId = MenuId.AideAgentEditsReview;
			previewOptions = { startLabel, start: -2, end: -1 };
			break;
		case ChatEditsState.MarkedComplete:
			menuId = MenuId.AideAgentEditsCompleted;
			break;
		default:
			break;
	}
	return { menuId, previewOptions };
}
