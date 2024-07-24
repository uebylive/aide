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
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PALETTE_IS_VISIBLE, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_LSP_ACTIVE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

const isProbingInProgress = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo('IN_PROGRESS');
const isProbingInReview = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo('IN_REVIEW');
const isIdle = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo('INACTIVE');
const isProbeActive = ContextKeyExpr.or(isProbingInProgress, isProbingInReview);

class OpenCommandPaletteAction extends Action2 {
	static readonly ID = 'workbench.action.aideCommandPalette.open';
	constructor() {
		super({
			id: OpenCommandPaletteAction.ID,
			title: localize2('openCommandPalette', "Open command palette"),
			f1: false,
			category: PROBE_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.ExternalExtension,
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				when: CONTEXT_PALETTE_IS_VISIBLE.negate()
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.showPalette();
	}
}

class CloseCommandPaletteAction extends Action2 {
	static readonly ID = 'workbench.action.aideCommandPalette.close';
	constructor() {
		super({
			id: CloseCommandPaletteAction.ID,
			title: localize2('closeCommandPalette', "Close command palette"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: CONTEXT_PALETTE_IS_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: CONTEXT_PALETTE_IS_VISIBLE
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteContext,
					group: 'navigation',
					when: CONTEXT_PALETTE_IS_VISIBLE
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.hidePalette();
	}
}

class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor(title?: ILocalizedString) {
		super({
			id: SubmitAction.ID,
			title: title ?? 'Go',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_LSP_ACTIVE, CONTEXT_PROBE_INPUT_HAS_TEXT, isIdle),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
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
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.acceptInput();
	}
}

class NavigateUpAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.navigateUp';

	constructor() {
		super({
			id: NavigateUpAction.ID,
			title: localize2('aideProbe.navigateUp.label', "Navigate up"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeActive),
			keybinding: {
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.EditorContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const commandPalette = commandPaletteService.widget;
		if (!commandPalette || !commandPalette.viewModel) {
			return;
		}

		const keyboardEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 });

		if (commandPalette.focusIndex !== undefined) {
			commandPalette.setFocusIndex(commandPalette.focusIndex - 1, keyboardEvent);
		} else {
			commandPalette.setFocusIndex(0, keyboardEvent);
		}
	}
}

class NavigateDownAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.navigateDown';

	constructor() {
		super({
			id: NavigateDownAction.ID,
			title: localize2('aideProbe.navigateDown.label', "Navigate down"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeActive),
			keybinding: {
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.EditorContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const commandPalette = commandPaletteService.widget;
		if (!commandPalette || !commandPalette.viewModel) {
			return;
		}

		const keyboardEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 40 });
		if (commandPalette.focusIndex !== undefined) {
			commandPalette.setFocusIndex(commandPalette.focusIndex + 1, keyboardEvent);
		} else {
			commandPalette.setFocusIndex(commandPalette.viewModel.breakdowns.length - 1, keyboardEvent);
		}
	}
}

class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.cancel';

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
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.cancelRequest();
	}
}

class AcceptAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.accept';

	constructor() {
		super({
			id: AcceptAction.ID,
			title: localize2('aideProbe.acceptAll.label', "Accept All"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: isProbingInReview,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isProbingInReview,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const probeService = accessor.get(IAideProbeService);

		probeService.acceptCodeEdits();
		commandPaletteService.widget?.clear();
		commandPaletteService.hidePalette();
	}
}

class RejectAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.reject';

	constructor() {
		super({
			id: RejectAction.ID,
			title: localize2('aideProbe.rejectAll.label', "Reject All"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: isProbingInReview,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isProbingInReview,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const probeService = accessor.get(IAideProbeService);

		probeService.rejectCodeEdits();
		commandPaletteService.widget?.clear();
		commandPaletteService.hidePalette();
	}
}

export function registerProbeActions() {
	registerAction2(OpenCommandPaletteAction);
	registerAction2(CloseCommandPaletteAction);
	registerAction2(SubmitAction);

	registerAction2(NavigateUpAction);
	registerAction2(NavigateDownAction);
	registerAction2(CancelAction);
	registerAction2(AcceptAction);
	registerAction2(RejectAction);
}
