/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { CONTEXT_AIDE_CONTROLS_HAS_FOCUS, CONTEXT_AIDE_CONTROLS_HAS_TEXT } from 'vs/workbench/contrib/aideAgent/browser/aideAgentContextKeys';
import { IAideControlsService } from 'vs/workbench/contrib/aideAgent/browser/aideControlsService';
import { AideAgentScope } from 'vs/workbench/contrib/aideAgent/common/aideAgentModel';
import { IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';

const AIDE_AGENT_CATEGORY = localize2('aideAgentcategory', 'Aide');

export interface IAgentActionContext {
	view?: IView;
	inputValue?: string;
}

class BlurAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgentblur';

	constructor() {
		super({
			id: BlurAction.ID,
			title: localize2('aideAgentblur.label', "Blur"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
			icon: Codicon.send,
			precondition: CONTEXT_AIDE_CONTROLS_HAS_FOCUS,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CONTEXT_AIDE_CONTROLS_HAS_FOCUS
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControls = accessor.get(IAideControlsService);
		aideControls.blurInput();
	}
}

class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgentsubmit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('aideAgentsubmit.label', "Go"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
			icon: Codicon.send,
			precondition: CONTEXT_AIDE_CONTROLS_HAS_TEXT,
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CONTEXT_AIDE_CONTROLS_HAS_TEXT
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation'
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControls = accessor.get(IAideControlsService);
		aideControls.acceptInput();
	}
}

// class CancelAction extends Action2 {
// 	static readonly ID = 'workbench.action.aideAgentcancel';

// 	constructor() {
// 		super({
// 			id: CancelAction.ID,
// 			title: localize2('aideAgentcancel.label', "Cancel"),
// 			f1: false,
// 			category: PROBE_CATEGORY,
// 			icon: Codicon.x,
// 			precondition: isProbeInProgress,
// 			keybinding: {
// 				primary: KeyCode.Escape,
// 				weight: KeybindingWeight.WorkbenchContrib,
// 				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS
// 			},
// 			menu: [
// 				{
// 					id: MenuId.AideControlsToolbar,
// 					group: 'navigation',
// 					when: isProbeInProgress,
// 				}
// 			]
// 		});
// 	}

// 	async run(accessor: ServicesAccessor, ...args: any[]) {
// 		const aideProbeService = accessor.get(IAideProbeService);
// 		aideProbeService.rejectCodeEdits();
// 		aideProbeService.clearSession();
// 	}
// }

// class ClearIterationAction extends Action2 {
// 	static readonly ID = 'workbench.action.aideAgentstop';

// 	constructor() {
// 		super({
// 			id: ClearIterationAction.ID,
// 			title: localize2('aideAgentstop.label', "Clear"),
// 			f1: false,
// 			category: PROBE_CATEGORY,
// 			icon: Codicon.send,
// 			precondition: isProbeIterationFinished,
// 			keybinding: {
// 				primary: KeyMod.WinCtrl | KeyCode.KeyL,
// 				weight: KeybindingWeight.WorkbenchContrib,
// 				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS,
// 			},
// 			menu: [
// 				{
// 					id: MenuId.AideControlsToolbar,
// 					group: 'navigation',
// 					when: isProbeIterationFinished,
// 				},
// 			]
// 		});
// 	}

// 	async run(accessor: ServicesAccessor) {
// 		const aideProbeService = accessor.get(IAideProbeService);
// 		aideProbeService.clearSession();
// 	}
// }

class FocusAideControls extends Action2 {
	static readonly ID = 'workbench.action.aideAgentfocus';

	constructor() {
		super({
			id: FocusAideControls.ID,
			title: localize2('aideAgentfocus.label', "Focus Aide Controls"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
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

export class SetAideAgentScopeSelection extends Action2 {
	static readonly ID = 'workbench.action.aideAgentsetScopeSelection';

	constructor() {
		super({
			id: SetAideAgentScopeSelection.ID,
			title: localize2('aideAgentsetScopeSelection.label', "Use selection range as the scope for AI edits"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit1,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideAgentService = accessor.get(IAideAgentService);
		aideAgentService.scope = AideAgentScope.Selection;
	}
}

export class SetAideAgentScopePinnedContext extends Action2 {
	static readonly ID = 'workbench.action.aideAgentsetScopePinnedContext';

	constructor() {
		super({
			id: SetAideAgentScopePinnedContext.ID,
			title: localize2('aideAgentsetScopePinnedContext.label', "Use Pinned Context as the scope for AI edits"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit2,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideAgentService = accessor.get(IAideAgentService);
		aideAgentService.scope = AideAgentScope.PinnedContext;
	}
}

export class SetAideAgentScopeWholeCodebase extends Action2 {
	static readonly ID = 'workbench.action.aideAgentsetScopeWholeCodebase';

	constructor() {
		super({
			id: SetAideAgentScopeWholeCodebase.ID,
			title: localize2('aideAgentsetScopeWholeCodebase.label', "Use the whole codebase as the scope for AI edits"),
			f1: false,
			category: AIDE_AGENT_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit3,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideAgentService = accessor.get(IAideAgentService);
		aideAgentService.scope = AideAgentScope.WholeCodebase;
	}
}

export function registerAgentActions() {
	registerAction2(FocusAideControls);
	registerAction2(BlurAction);
	registerAction2(SubmitAction);
	// registerAction2(CancelAction);
	// registerAction2(ClearIterationAction);
	registerAction2(SetAideAgentScopeSelection);
	registerAction2(SetAideAgentScopePinnedContext);
	registerAction2(SetAideAgentScopeWholeCodebase);
}
