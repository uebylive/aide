/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ILocalizedString, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS, CONTEXT_PROBE_IS_LSP_ACTIVE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IAideProbeService, ProbeMode } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

export class OpenCommandPaletteAction extends Action2 {
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

			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.showPalette();
	}
}

export class CloseCommandPaletteAction extends Action2 {
	static readonly ID = 'workbench.action.aideCommandPalette.close';
	constructor() {
		super({
			id: CloseCommandPaletteAction.ID,
			title: localize2('closeCommandPalette', "Close command palette"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: CONTEXT_PROBE_IS_ACTIVE.negate(),
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

export class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor(title?: ILocalizedString) {
		super({
			id: SubmitAction.ID,
			title: title ?? 'Go',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_LSP_ACTIVE, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
					order: 9
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.acceptInput();
	}
}

export class EnterExploreModeAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.enterExploreMode';

	constructor() {
		super({
			id: EnterExploreModeAction.ID,
			title: localize2('workbench.action.aideProbe.enterExploreMode', "Change to explore mode"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.KeyM,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				//{
				//	id: MenuId.AideCommandPaletteSubmit,
				//	group: 'navigation',
				//	when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(), CONTEXT_PROBE_MODE.isEqualTo('edit')),
				//},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.widget?.setMode('explore');
	}
}

export class EnterEditModeAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.enterEditMode';

	constructor() {
		super({
			id: EnterEditModeAction.ID,
			title: localize2('workbench.action.aideProbe.enterEditMode', "Change to edit mode"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyMod.Alt | KeyCode.KeyM,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				//{
				//	id: MenuId.AideCommandPaletteSubmit,
				//	group: 'navigation',
				//	when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(), CONTEXT_PROBE_MODE.isEqualTo('explore')),
				//},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.widget?.setMode('edit');
	}
}

export class NavigateUpAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.navigateUp';

	constructor() {
		super({
			id: NavigateUpAction.ID,
			title: localize2('aideProbe.navigateUp.label', "Navigate up"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_IS_ACTIVE),
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

export class NavigateDownAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.navigateDown';

	constructor() {
		super({
			id: NavigateDownAction.ID,
			title: localize2('aideProbe.navigateDown.label', "Navigate down"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_IS_ACTIVE),
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

export class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.cancel';

	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('aideProbe.cancel.label', "Cancel"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const probeService = accessor.get(IAideProbeService);

		probeService.rejectCodeEdits();
		commandPaletteService.cancelRequest();
		commandPaletteService.widget?.clear();
	}
}

export class RejectAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.reject';

	constructor() {
		super({
			id: RejectAction.ID,
			title: localize2('aideProbe.rejectAll.label', "Reject All"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
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

export class AcceptAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.accept';

	constructor() {
		super({
			id: AcceptAction.ID,
			title: localize2('aideProbe.acceptAll.label', "Accept All"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
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


export class ClearAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.clear';

	constructor() {
		super({
			id: ClearAction.ID,
			title: localize2('aideProbe.clear.label', "Clear"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.clearAll,
			precondition: CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteContext,
					group: 'navigation',
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		const probeService = accessor.get(IAideProbeService);

		probeService.rejectCodeEdits();
		commandPaletteService.widget?.clear();
	}
}

export function registerProbeActions() {
	registerAction2(OpenCommandPaletteAction);
	registerAction2(CloseCommandPaletteAction);
	registerAction2(CancelAction);
	registerAction2(ClearAction);
	registerAction2(NavigateUpAction);
	registerAction2(NavigateDownAction);
	registerAction2(SubmitAction);
	registerAction2(AcceptAction);
	registerAction2(RejectAction);
	registerAction2(EnterExploreModeAction);
	registerAction2(EnterEditModeAction);
}
