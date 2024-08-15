/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ILocalizedString, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { IAideControlsService } from 'vs/workbench/contrib/aideProbe/browser/aideControls';
import { IAideEditsService } from 'vs/workbench/contrib/aideProbe/browser/aideEditsPanel';
import { CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

const isProbingInProgress = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo('IN_PROGRESS');
const isIdle = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo('INACTIVE');

class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideControls.submit';

	constructor(title?: ILocalizedString) {
		super({
			id: SubmitAction.ID,
			title: title ?? 'Go',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_TEXT, isIdle),
			keybinding: {
				when: CONTEXT_PROBE_INPUT_HAS_TEXT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isIdle
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const controlsService = accessor.get(IAideControlsService);
		controlsService.acceptInput();
		const editsService = accessor.get(IAideEditsService);
		editsService.openPanel();
	}
}

class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.aideControls.cancel';

	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('aideProbe.cancel.label', "Cancel"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: isProbingInProgress,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isProbingInProgress,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const editsService = accessor.get(IAideEditsService);
		editsService.closePanel();
	}
}

export function registerAideControlsActions() {
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
}
