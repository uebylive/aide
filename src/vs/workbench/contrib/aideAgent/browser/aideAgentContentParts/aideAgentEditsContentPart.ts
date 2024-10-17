/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AideAgentRichItem } from './aideAgentRichItem.js';

export class EditsStartedContentPart extends AideAgentRichItem {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(
			localize('agent.editing', "Editing"),
			'micro/bolt',
			MenuId.AideAgentEditsLoading,
			instantiationService,
			keybindingService
		);
	}
}

export class EditsProgressContentPart extends AideAgentRichItem {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(
			localize('agent.editing', "Editing"),
			'micro/bolt',
			MenuId.AideAgentEditsLoading,
			instantiationService,
			keybindingService
		);
	}
}

export class EditsReviewContentPart extends AideAgentRichItem {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(
			localize('agent.editsMade', "Edits made"),
			'micro/bolt',
			MenuId.AideAgentEditsReview,
			instantiationService,
			keybindingService
		);
	}
}

export class EditsCompletedContentPart extends AideAgentRichItem {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(
			localize('agent.editsMade', "Edits made"),
			'micro/bolt',
			MenuId.AideAgentEditsCompleted,
			instantiationService,
			keybindingService
		);
	}
}

export class EditsCancelledContentPart extends AideAgentRichItem {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(
			localize('agent.editsCancelled', "Edits cancelled"),
			'micro/x-mark',
			null,
			instantiationService,
			keybindingService
		);
	}
}



