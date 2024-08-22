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
const isProbeInactive = CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.INACTIVE);
const isProbeIdle = ContextKeyExpr.or(isProbeInactive, CONTEXT_PROBE_REQUEST_STATUS.isEqualTo(AideProbeStatus.IN_REVIEW));


class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('aideProbe.submit.label', "Go"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIdle, CONTEXT_PROBE_INPUT_HAS_TEXT),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
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

class IterateAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.iterate';

	constructor() {
		super({
			id: IterateAction.ID,
			title: localize2('aideProbe.iterate.label', "Iterate"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIterationFinished, CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED), CONTEXT_PROBE_INPUT_HAS_TEXT),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
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
				primary: KeyMod.CtrlCmd | KeyCode.Escape,
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
		aideProbeService.clearSession();
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
			precondition: ContextKeyExpr.or(
				isProbeIdle,
				ContextKeyExpr.and(isProbeIterationFinished, CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
			),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyS,
				weight: KeybindingWeight.EditorContrib,
				when: CONTEXT_PROBE_INPUT_HAS_FOCUS,
			},
			menu: [
				{
					id: MenuId.AideControlsToolbar,
					group: 'navigation',
					when: ContextKeyExpr.or(
						ContextKeyExpr.and(isProbeIterationFinished, CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
						isProbeIdle
					),
				},
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const aideProbeService = accessor.get(IAideProbeService);
		const currentSession = aideProbeService.getSession();
		if (!currentSession) {
			const contextKeyService = accessor.get(IContextKeyService);
			CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.FOLLOW_UP);
			const aideControls = accessor.get(IAideControlsService);
			aideControls.acceptInput();
		} else {
			aideProbeService.makeFollowupRequest();
		}
	}
}

class StopIterationAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.stop';

	constructor() {
		super({
			id: StopIterationAction.ID,
			title: localize2('aideProbe.stop.label', "Close"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(isProbeIterationFinished, CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Escape,
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
		aideProbeService.clearSession();

		const editorService = accessor.get(IEditorService);
		const editor = editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			editor.getContribution<IKeybindingPillContribution>(KeybindingPillContribution.ID)?.hideAnchorEditingDecoration();
		}
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
			precondition: isProbeInactive,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				weight: KeybindingWeight.WorkbenchContrib,
				when: isProbeInactive,
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


export function registerProbeActions() {
	registerAction2(EnterAgenticEditing);
	registerAction2(EnterAnchoredEditing);
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
	registerAction2(IterateAction);
	registerAction2(StopIterationAction);
	registerAction2(RequestFollowUpAction);
}
