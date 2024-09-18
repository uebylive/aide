/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IView } from '../../../../../workbench/common/views.js';
import { IAideControlsService } from '../../../../../workbench/contrib/aideProbe/browser/aideControls.js';
import * as CTX from '../../../../../workbench/contrib/aideProbe/browser/aideProbeContextKeys.js';
import { IAideProbeService } from '../../../../../workbench/contrib/aideProbe/browser/aideProbeService.js';
import { AideProbeMode, AideProbeStatus } from '../../../../../workbench/contrib/aideProbe/common/aideProbe.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { clearProbeView, VIEW_ID } from '../../../../../workbench/contrib/aideProbe/browser/aideProbe.js';

const PROBE_CATEGORY = localize2('aideProbe.category', 'Aide');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

const isProbeInProgress = CTX.CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.IN_PROGRESS);
const isProbeIterationFinished = CTX.CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.ITERATION_FINISHED);
const isProbeInactive = CTX.CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.INACTIVE);
const isProbeIdle = ContextKeyExpr.or(isProbeInactive, CTX.CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.IN_REVIEW));

function logProbeContext(accessor: ServicesAccessor) {
	const contextKeyService = accessor.get(IContextKeyService);
	if (IsDevelopmentContext.getValue(contextKeyService)) {
		const context: Record<string, any> = {};
		for (const ctxKey in CTX) {
			const raw = CTX[ctxKey as keyof typeof CTX];
			context[raw.key] = raw.getValue(contextKeyService);
		}
		// console.table(context);
	}
}

class BlurAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.blur';

	constructor() {
		super({
			id: BlurAction.ID,
			title: localize2('aideProbe.blur.label', "Blur"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeIdle),
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeIdle),
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		console.log('blur');
		const aideControls = accessor.get(IAideControlsService);
		aideControls.blurInput();
	}
}

class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('aideProbe.submit.label', "Go"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIdle, CTX.CONTEXT_PROBE_INPUT_HAS_TEXT),
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS,
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
		logProbeContext(accessor);
	}
}

class IterateAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.iterate';

	constructor() {
		super({
			id: IterateAction.ID,
			title: localize2('aideProbe.iterate.label', "Iterate"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIterationFinished, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED), CTX.CONTEXT_PROBE_INPUT_HAS_TEXT),
			keybinding: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: ContextKeyExpr.and(isProbeIterationFinished, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControls = accessor.get(IAideControlsService);
		aideControls.acceptInput();
		logProbeContext(accessor);
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
				weight: KeybindingWeight.WorkbenchContrib,
				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS
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
		aideProbeService.clearSession();

		const viewsService = accessor.get(IViewsService);
		clearProbeView(viewsService, true);

		logProbeContext(accessor);
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
			precondition: ContextKeyExpr.or(CTX.CONTEXT_PROBE_HAS_SELECTION, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyY,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					when: ContextKeyExpr.or(isProbeIdle, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideProbeService = accessor.get(IAideProbeService);
		const currentSession = aideProbeService.getSession();
		if (!currentSession) {
			const contextKeyService = accessor.get(IContextKeyService);
			CTX.CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.FOLLOW_UP);
			const aideControls = accessor.get(IAideControlsService);
			aideControls.acceptInput();
		} else {
			aideProbeService.makeFollowupRequest();
		}
		logProbeContext(accessor);
	}
}

class ClearIterationAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.stop';

	constructor() {
		super({
			id: ClearIterationAction.ID,
			title: localize2('aideProbe.stop.label', "Clear"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIterationFinished, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
			keybinding: {
				primary: KeyMod.WinCtrl | KeyCode.KeyL,
				weight: KeybindingWeight.WorkbenchContrib,
				when: CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: ContextKeyExpr.and(isProbeIterationFinished, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideProbeService = accessor.get(IAideProbeService);
		aideProbeService.clearSession();

		const viewsService = accessor.get(IViewsService);
		clearProbeView(viewsService, true);

		logProbeContext(accessor);
	}
}

class FocusAideControls extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.focus';

	constructor() {
		super({
			id: FocusAideControls.ID,
			title: localize2('aideProbe.focus.label', "Focus Aide Controls"),
			f1: false,
			category: PROBE_CATEGORY,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				weight: KeybindingWeight.WorkbenchContrib + 1,
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideControlsService = accessor.get(IAideControlsService);
		aideControlsService.focusInput();
		logProbeContext(accessor);
	}
}

class ToggleAideProbeMode extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.toggleMode';

	constructor() {
		super({
			id: ToggleAideProbeMode.ID,
			title: localize2('aideProbe.toggleMode.label', "Toggle Aide Probe Mode"),
			f1: false,
			category: PROBE_CATEGORY,
			precondition: ContextKeyExpr.and(CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeIdle),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS, isProbeIdle),
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const contextKeyService = accessor.get(IContextKeyService);
		const currentMode = CTX.CONTEXT_PROBE_MODE.getValue(contextKeyService);
		const newMode = currentMode === AideProbeMode.AGENTIC ? AideProbeMode.ANCHORED : AideProbeMode.AGENTIC;
		CTX.CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(newMode);
		logProbeContext(accessor);
	}
}


class ClearList extends Action2 {
	constructor() {
		super({
			id: `workbench.action.aideProbe.clearList`,
			title: localize2('aideProbe.clearList.label', "Clear list..."),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', VIEW_ID),
				group: 'navigation',
				order: -1
			},
			category: PROBE_CATEGORY,
			icon: Codicon.x,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor) {
		clearProbeView(accessor.get(IViewsService), true);
	}
}

export function registerProbeActions() {
	registerAction2(FocusAideControls);
	registerAction2(BlurAction);
	registerAction2(ToggleAideProbeMode);
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
	registerAction2(IterateAction);
	registerAction2(ClearIterationAction);
	registerAction2(RequestFollowUpAction);
	registerAction2(ClearList);
}
