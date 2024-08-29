/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { IKeybindingPillContribution, KeybindingPillContribution } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatKeybindingPillContrib';
import { IAideControlsService } from 'vs/workbench/contrib/aideProbe/browser/aideControls';
import * as CTX from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeViewPane } from 'vs/workbench/contrib/aideProbe/browser/aideProbeView';
import { AideProbeMode, AideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

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
		console.table(context);
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

		const commandService = accessor.get(ICommandService);
		commandService.executeCommand(ExitAnchoredEditing.ID);

		const viewsService = accessor.get(IViewsService);
		const aideProbeView = viewsService.getViewWithId<AideProbeViewPane>(AideProbeViewPane.id);
		if (aideProbeView) {
			aideProbeView.clear();
		}

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
				primary: KeyCode.Escape,
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
		aideProbeService.rejectCodeEdits();

		const commandService = accessor.get(ICommandService);
		commandService.executeCommand(ExitAnchoredEditing.ID);

		const viewsService = accessor.get(IViewsService);
		const aideProbeView = viewsService.getViewWithId<AideProbeViewPane>(AideProbeViewPane.id);
		if (aideProbeView) {
			aideProbeView.clear();
		}


		const editorService = accessor.get(IEditorService);
		const editor = editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			editor.getContribution<IKeybindingPillContribution>(KeybindingPillContribution.ID)?.hideAnchorEditingDecoration();
		}
		logProbeContext(accessor);
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
			precondition: isProbeIdle,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				weight: KeybindingWeight.ExternalExtension, // Necessary to override the default keybinding
				when: isProbeIdle,
			},
		});
	}

	async run(accessor: ServicesAccessor) {

		const aideProbeService = accessor.get(IAideProbeService);
		const aideControlsService = accessor.get(IAideControlsService);
		const editorService = accessor.get(IEditorService);
		const contextKeyService = accessor.get(IContextKeyService);
		const outlineModelService = accessor.get(IOutlineModelService);

		const editor = editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return;
		}
		const model = editor.getModel();
		const selection = editor.getSelection();
		if (!model || !selection) { return; }

		const outlineModel = await outlineModelService.getOrCreate(model, CancellationToken.None);

		const symbolNames: string[] = [];
		for (const symbol of outlineModel.getTopLevelSymbols()) {
			if (selection.intersectRanges(symbol.range)) {
				symbolNames.push(symbol.name);
			}
		}

		const keybindingPillContribution = editor.getContribution<IKeybindingPillContribution>(KeybindingPillContribution.ID);

		if (keybindingPillContribution) {
			keybindingPillContribution.hideAnchorEditingDecoration();
		}

		aideProbeService.anchorEditingSelection = { uri: model.uri, selection, symbolNames };
		CTX.CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.ANCHORED);
		aideControlsService.focusInput();

		if (keybindingPillContribution) {
			keybindingPillContribution.showAnchorEditingDecoration(aideProbeService.anchorEditingSelection);
		}
	}
}


class ExitAnchoredEditing extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.exitAnchoredEditing';

	constructor() {
		super({
			id: ExitAnchoredEditing.ID,
			title: localize2('Exit anchored editing', 'Exit anchored editing'),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(CTX.CONTEXT_PROBE_INPUT_HAS_FOCUS, CTX.CONTEXT_PROBE_MODE.isEqualTo(AideProbeMode.ANCHORED)),
			},
		});
	}

	async run(accessor: ServicesAccessor) {

		const aideProbeService = accessor.get(IAideProbeService);
		const editorService = accessor.get(IEditorService);
		const contextKeyService = accessor.get(IContextKeyService);

		if (CTX.CONTEXT_PROBE_REQUEST_STATUS.getValue(contextKeyService) !== AideProbeStatus.INACTIVE) {
			aideProbeService.clearSession();
		}

		const editor = editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			const keybindingPillContribution = editor.getContribution<IKeybindingPillContribution>(KeybindingPillContribution.ID);
			if (keybindingPillContribution) {
				keybindingPillContribution.hideAnchorEditingDecoration();
			}
		}
		aideProbeService.anchorEditingSelection = undefined;
		CTX.CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.AGENTIC);
		logProbeContext(accessor);
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
		CTX.CONTEXT_PROBE_MODE.bindTo(contextKeyService).set(AideProbeMode.AGENTIC);

		const aideControlsService = accessor.get(IAideControlsService);
		aideControlsService.focusInput();
		logProbeContext(accessor);
	}
}


export function registerProbeActions() {
	registerAction2(EnterAgenticEditing);
	registerAction2(EnterAnchoredEditing);
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
	registerAction2(IterateAction);
	registerAction2(ClearIterationAction);
	registerAction2(RequestFollowUpAction);
	registerAction2(ExitAnchoredEditing);
}
