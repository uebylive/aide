/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAideControlsService } from '../aideControlsService.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

class FocusAideControls extends Action2 {
	static readonly ID = 'workbench.action.aideControls.focus';

	constructor() {
		super({
			id: FocusAideControls.ID,
			title: localize2('aideAgent.focus.label', "Focus Aide Controls"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				weight: KeybindingWeight.WorkbenchContrib + 1,
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControlsService = accessor.get(IAideControlsService);
		aideControlsService.focusInput();
	}
}

export function registerAideControlsActions() {
	registerAction2(FocusAideControls);
}
