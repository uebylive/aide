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
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { ProbeMode } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';

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
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyY,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		console.log(OpenCommandPaletteAction.ID);
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
		console.log(CloseCommandPaletteAction.ID);
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
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
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

	async run(accessor: ServicesAccessor, ...args: any[]) {
		console.log(SubmitAction.ID);
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.acceptInput();
	}
}


export class ToggleModeAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.toggleMode';

	constructor(title?: ILocalizedString) {
		const defaultTitle = localize2('workbench.action.aideProbe.toggleMode', "Toggle mode");
		super({
			id: ToggleModeAction.ID,
			title: title ?? defaultTitle,
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
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: ContextKeyExpr.and(CONTEXT_PROBE_IS_ACTIVE.negate(), CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
				},
			]
		});
	}

	async run(accessor: ServicesAccessor, mode: ProbeMode) {
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.widget?.setMode(mode);
	}
}


class ToggleModeActionComposer extends Disposable {
	static readonly ID = 'workbench.action.aideProbe.submitComposer';

	private registeredAction: IDisposable | undefined;
	private mode: IContextKey<'edit' | 'explore'>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.mode = CONTEXT_PROBE_MODE.bindTo(contextKeyService);
		this.setSubmitActionState();
	}


	private async setSubmitActionState() {
		const that = this;
		if (this.registeredAction) {
			this.registeredAction.dispose();
		}
		if (this.mode.get() === 'explore') {
			this.registeredAction = registerAction2(class extends ToggleModeAction {
				constructor() {
					super();
				}
				override async run(accessor: ServicesAccessor) {
					super.run(accessor, 'edit');
					that.mode.set('edit');
					that.setSubmitActionState();
				}
			});
		} else {
			this.registeredAction = registerAction2(class extends ToggleModeAction {
				constructor() {
					super();
				}
				override async run(accessor: ServicesAccessor) {
					super.run(accessor, 'explore');
					that.mode.set('explore');
					that.setSubmitActionState();
				}
			});

		}
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
		console.log(NavigateUpAction.ID);
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
		console.log(NavigateDownAction.ID);
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
		console.log(CancelAction.ID);
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.cancelRequest();
	}
}

export class RejectAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.reject';

	constructor() {
		super({
			id: RejectAction.ID,
			title: localize2('aideProbe.reject.label', "Reject"),
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
		console.log(RejectAction.ID);
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.rejectCodeEdits();
	}
}

export class AcceptAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.accept';

	constructor() {
		super({
			id: AcceptAction.ID,
			title: localize2('aideProbe.accept.label', "Accept"),
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
		console.log(AcceptAction.ID);
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.acceptCodeEdits();
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
		console.log(ClearAction.ID);
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		if (!commandPaletteService.widget) {
			return;
		}
		commandPaletteService.widget.clear();
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
	registerWorkbenchContribution2(ToggleModeActionComposer.ID, ToggleModeActionComposer, WorkbenchPhase.BlockStartup);
}
