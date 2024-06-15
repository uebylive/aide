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
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_INPUT_HAS_TEXT } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';

const PROBE_CATEGORY = localize2('aideProbe.category', 'AI Search');

export interface IProbeActionContext {
	view?: IView;
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
			precondition: ContextKeyExpr.and(CONTEXT_PROBE_INPUT_HAS_TEXT),
			keybinding: {
				when: CONTEXT_IN_PROBE_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.AideProbePrimary,
					group: 'navigation',
				}
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		console.log('SubmitAction.run');
	}
}

export function registerProbeActions() {
	registerAction2(SubmitAction);
}
