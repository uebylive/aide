/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ILocalizedString, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IView } from 'vs/workbench/common/views';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_HAS_STARTING_POINT, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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
			title: title ?? 'Submit',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_HAS_STARTING_POINT, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(), CONTEXT_PROBE_IS_ACTIVE.negate()),
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


class SubmitActionComposer extends Disposable {
	static readonly ID = 'workbench.action.aideProbe.submitComposer';

	private registeredAction: IDisposable | undefined;
	private hasStartingPoint: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
		this.hasStartingPoint = CONTEXT_PROBE_HAS_STARTING_POINT.bindTo(contextKeyService);

		this.setSubmitActionState();
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.setSubmitActionState();
		}));
	}

	private setSubmitActionState() {
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor?.resource) {
			this.registeredAction?.dispose();
			const fileName = basenameOrAuthority(activeEditor.resource);
			const title = localize2('aideProbe.submit.label', "Start search from {0}", fileName);
			this.registeredAction = registerAction2(class extends SubmitAction {
				constructor() {
					super(title);
				}
			});
			this.hasStartingPoint.set(true);
		} else {
			this.registeredAction?.dispose();
			this.registeredAction = registerAction2(class extends SubmitAction {
				constructor() {
					super(localize2('aideProbe.submitComposer.label', "Open a file to start searching from"));
				}
			});
			this.hasStartingPoint.set(false);
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
			precondition: CONTEXT_PROBE_INPUT_HAS_FOCUS && CONTEXT_PROBE_IS_ACTIVE,
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
			precondition: CONTEXT_PROBE_INPUT_HAS_FOCUS && CONTEXT_PROBE_IS_ACTIVE,
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
			precondition: CONTEXT_PROBE_REQUEST_IN_PROGRESS,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: CONTEXT_PROBE_REQUEST_IN_PROGRESS,
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
	registerWorkbenchContribution2(SubmitActionComposer.ID, SubmitActionComposer, WorkbenchPhase.BlockStartup);
}
