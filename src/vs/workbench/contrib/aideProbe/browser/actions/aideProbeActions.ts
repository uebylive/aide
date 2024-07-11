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
import { commands } from 'vs/workbench/browser/web.factory';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}


export class OpenCommandPaletteGlobalAction extends Action2 {
	static readonly ID = 'workbench.action.aideCommandPalette.open';
	constructor() {
		super({
			id: OpenCommandPaletteGlobalAction.ID,
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
		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.showPalette();
	}
}


export class CloseCommandPaletteGlobalAction extends Action2 {
	static readonly ID = 'workbench.action.aideCommandPalette.close';
	constructor() {
		super({
			id: CloseCommandPaletteGlobalAction.ID,
			title: localize2('closeCommandPalette', "Close command palette"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
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
			title: title ?? 'Submit',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_HAS_STARTING_POINT, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteSubmit,
					group: 'navigation',
					when: CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(),
				},
				{
					id: MenuId.AideProbePrimary,
					group: 'navigation',
					when: CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {

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

export class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.cancel';

	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('aideProbe.cancel.label', "Cancel"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: CONTEXT_PROBE_REQUEST_IN_PROGRESS,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideProbePrimary,
					group: 'navigation',
					when: CONTEXT_PROBE_REQUEST_IN_PROGRESS,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {

		const commandPaletteService = accessor.get(IAideCommandPaletteService);
		commandPaletteService.cancelRequest();
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
			precondition: CONTEXT_PROBE_INPUT_HAS_FOCUS,
			keybinding: {
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.EditorContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		console.log('up');
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
			precondition: CONTEXT_PROBE_INPUT_HAS_FOCUS,
			keybinding: {
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.EditorContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		console.log('down');
	}
}

export class ExitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.exit';

	constructor() {
		super({
			id: ExitAction.ID,
			title: localize2('aideProbe.cancel.label', "Cancel"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			precondition: CONTEXT_PROBE_IS_ACTIVE,
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
		commandPaletteService.cancelRequest();
		commands.executeCommand('setContext', 'aideProbeRequestIsActive', false);
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
			menu: [
				{
					id: MenuId.ViewTitle,
					group: 'navigation',
					order: 1,
					//when: ContextKeyExpr.equals('view', VIEW_ID)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		// clear in palette
	}
}

export function registerProbeActions() {
	registerAction2(OpenCommandPaletteGlobalAction);
	registerAction2(CloseCommandPaletteGlobalAction);
	registerAction2(CancelAction);
	registerAction2(ClearAction);
	registerAction2(ExitAction);
	registerAction2(NavigateUpAction);
	registerAction2(NavigateDownAction);
	registerWorkbenchContribution2(SubmitActionComposer.ID, SubmitActionComposer, WorkbenchPhase.BlockStartup);
}
