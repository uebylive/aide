/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode } from 'vs/base/common/keyCodes';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IView } from 'vs/workbench/common/views';
import { showProbeView } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
	inputValue?: string;
}

export class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
			title: localize2('aideProbe.submit.label', "Start search"),
			f1: false,
			category: PROBE_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate()),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideProbePrimary,
					group: 'navigation',
					when: CONTEXT_PROBE_REQUEST_IN_PROGRESS.negate(),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const aideProbeView = await showProbeView(accessor.get(IViewsService));
		if (!aideProbeView) {
			return;
		}

		aideProbeView.acceptInput();
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
				weight: KeybindingWeight.EditorContrib
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

		const aideProbeView = await showProbeView(accessor.get(IViewsService));
		if (!aideProbeView) {
			return;
		}

		console.log('Cancel probe request');
	}
}

export function registerProbeActions() {
	registerAction2(SubmitAction);
	registerAction2(CancelAction);
}
