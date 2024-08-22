/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { IKeybindingPillContribution, KeybindingPillContribution } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatKeybindingPillContrib';
import { IAideControlsService } from 'vs/workbench/contrib/aideProbe/browser/aideControls';
import { CONTEXT_PROBE_HAS_VALID_SELECTION, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeMode, AideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

const isProbeInProgress = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.IN_PROGRESS);
const isProbeIterationFinished = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.ITERATION_FINISHED);
const isProbeInReview = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.IN_PROGRESS);
const isProbeIdle = CONTEXT_PROBE_REQUEST_STATUS.notEqualsTo(AideProbeStatus.IN_PROGRESS);
const isProbeActive = ContextKeyExpr.or(isProbeInProgress, isProbeInReview);


class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('aideProbe.submit.label', "Go"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: CONTEXT_PROBE_INPUT_HAS_TEXT,
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: isProbeIdle
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControls = accessor.get(IAideControlsService);
		aideControls.acceptInput();
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
			precondition: isProbeInProgress,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: isProbeInProgress,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const aideProbeService = accessor.get(IAideProbeService);
		aideProbeService.rejectCodeEdits();
	}
}

class RequestFollowUpAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.followups';

	constructor() {
		super({
			id: RequestFollowUpAction.ID,
			title: localize2('aideProbe.followups.label', "Make follow-ups"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: CONTEXT_PROBE_INPUT_HAS_TEXT,
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: ContextKeyExpr.and(isProbeIterationFinished, CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideProbeService = accessor.get(IAideProbeService);
		aideProbeService.makeFollowupRequest();
	}
}

class EnterAnchoredEditing extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.enterAnchoredEditing';

	constructor() {
		super({
			id: EnterAnchoredEditing.ID,
			title: localize2('Enter anchored editing', 'Enter anchored editing'),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_HAS_VALID_SELECTION, isProbeIdle),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				weight: KeybindingWeight.ExternalExtension,
				when: ContextKeyExpr.and(CONTEXT_PROBE_HAS_VALID_SELECTION, isProbeIdle),
			},
		});
	}

	async run(accessor: ServicesAccessor) {

		const aideProbeService = accessor.get(IAideProbeService);
		const aideControlsService = accessor.get(IAideControlsService);
		const editorService = accessor.get(IEditorService);
		const contextKeyService = accessor.get(IContextKeyService);

		const editor = editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			const model = editor.getModel();
			const selection = editor.getSelection();
			if (model && selection) {
				aideProbeService.anchorEditingSelection = { uri: model.uri, selection };
				CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.ANCHORED);
				aideControlsService.focusInput();
				editor.getContribution<IKeybindingPillContribution>(KeybindingPillContribution.ID)?.showAnchorEditingDecoration(model.uri, selection);
			}


		}
	}
}

class EnterAgenticEditing extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.enterAgenticEditing';

	constructor() {
		super({
			id: EnterAgenticEditing.ID,
			title: 'Enter agentic editing',
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: isProbeIdle,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				weight: KeybindingWeight.WorkbenchContrib,
				when: isProbeIdle,
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const contextKeyService = accessor.get(IContextKeyService);
		CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.AGENTIC);

		const aideControlsService = accessor.get(IAideControlsService);
		aideControlsService.focusInput();
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
		//const commandPaletteService = accessor.get(IAideCommandPaletteService);
		//const commandPalette = commandPaletteService.widget;
		//if (!commandPalette || !commandPalette.viewModel) {
		//	return;
		//}
		//
		//const keyboardEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 });
		//
		//if (commandPalette.focusIndex !== undefined) {
		//	commandPalette.setFocusIndex(commandPalette.focusIndex - 1, keyboardEvent);
		//} else {
		//	commandPalette.setFocusIndex(0, keyboardEvent);
		//}
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
		//const commandPaletteService = accessor.get(IAideCommandPaletteService);
		//const commandPalette = commandPaletteService.widget;
		//if (!commandPalette || !commandPalette.viewModel) {
		//	return;
		//}
		//
		//const keyboardEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 40 });
		//if (commandPalette.focusIndex !== undefined) {
		//	commandPalette.setFocusIndex(commandPalette.focusIndex + 1, keyboardEvent);
		//} else {
		//	commandPalette.setFocusIndex(commandPalette.viewModel.breakdowns.length - 1, keyboardEvent);
		//}
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
			precondition: isProbeInReview,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isProbeInReview,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		//const commandPaletteService = accessor.get(IAideCommandPaletteService);
		//const probeService = accessor.get(IAideProbeService);
		//
		//probeService.acceptCodeEdits();
		//commandPaletteService.widget?.clear();
		//commandPaletteService.hidePalette();
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
			precondition: isProbeInReview,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS
			},
			menu: [
				{
					id: MenuId.AideCommandPaletteToolbar,
					group: 'navigation',
					when: isProbeInReview,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		//const commandPaletteService = accessor.get(IAideCommandPaletteService);
		//const probeService = accessor.get(IAideProbeService);
		//
		//probeService.rejectCodeEdits();
		//commandPaletteService.widget?.clear();
		//commandPaletteService.hidePalette();
	}
}

export function registerProbeActions() {
	registerAction2(SubmitAction);
	registerAction2(RequestFollowUpAction);
	registerAction2(EnterAgenticEditing);
	registerAction2(EnterAnchoredEditing);

	registerAction2(NavigateUpAction);
	registerAction2(NavigateDownAction);
	registerAction2(CancelAction);
	registerAction2(AcceptAction);
	registerAction2(RejectAction);
}


// class OpenCommandPaletteAction extends Action2 {
// static readonly ID = 'workbench.action.aideCommandPalette.open';
// constructor() {
// super({
// id: OpenCommandPaletteAction.ID,
// title: localize2('openCommandPalette', "Open command palette"),
// f1: false,
// category: PROBE_CATEGORY,
// keybinding: {
// weight: KeybindingWeight.ExternalExtension,
// primary: KeyMod.CtrlCmd | KeyCode.KeyK,
// when: CONTEXT_PALETTE_IS_VISIBLE.negate()
// }
// });
// }
//
// override async run(accessor: ServicesAccessor): Promise<void> {
// const commandPaletteService = accessor.get(IAideCommandPaletteService);
// commandPaletteService.showPalette();
// }
// }
//
// class CloseCommandPaletteAction extends Action2 {
// static readonly ID = 'workbench.action.aideCommandPalette.close';
// constructor() {
// super({
// id: CloseCommandPaletteAction.ID,
// title: localize2('closeCommandPalette', "Close command palette"),
// f1: false,
// category: PROBE_CATEGORY,
// precondition: CONTEXT_PALETTE_IS_VISIBLE,
// keybinding: {
// weight: KeybindingWeight.WorkbenchContrib,
// primary: KeyCode.Escape,
// when: CONTEXT_PALETTE_IS_VISIBLE
// },
// menu: [
// {
// id: MenuId.AideCommandPaletteContext,
// group: 'navigation',
// when: CONTEXT_PALETTE_IS_VISIBLE
// }
// ]
// });
// }
//
// override async run(accessor: ServicesAccessor): Promise<void> {
// const commandPaletteService = accessor.get(IAideCommandPaletteService);
// commandPaletteService.hidePalette();
// }
// }
