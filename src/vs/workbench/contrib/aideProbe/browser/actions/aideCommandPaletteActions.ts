/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';



export const COMMAND_PALETTE_CATEGORY = localize2('aideCommandPalette.category', 'Aide');
export const COMMAND_PALETTE_OPEN_ACTION_ID = 'workbench.action.aideCommandPalette.open';

class OpenCommandPaletteGlobalAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_PALETTE_OPEN_ACTION_ID,
			title: localize2('openCommandPalette', "Open command palette"),
			f1: false,
			category: COMMAND_PALETTE_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyY,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.showPalette();
	}
}

export const COMMAND_PALETTE_CLOSE_ACTION_ID = 'workbench.action.aideCommandPalette.close';

class CloseCommandPaletteGlobalAction extends Action2 {
	constructor() {
		super({
			id: COMMAND_PALETTE_CLOSE_ACTION_ID,
			title: localize2('closeCommandPalette', "Close command palette"),
			f1: false,
			category: COMMAND_PALETTE_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.hidePalette();
	}
}

export function registerCommandPaletteActions() {
	registerAction2(OpenCommandPaletteGlobalAction);
	registerAction2(CloseCommandPaletteGlobalAction);
}
