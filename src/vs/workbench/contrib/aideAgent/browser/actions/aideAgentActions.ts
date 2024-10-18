/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2, MenuId } from '../../../../../platform/actions/common/actions.js';

export function registerAgentActions() {
	registerAction2(class RevertAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.revert',
				title: localize2('interactiveSession.revert.label', "Revert to this step"),
				menu: {
					id: MenuId.AideAgentEditsCompleted,
					group: 'navigation',
					order: 2
				},
				icon: Codicon.discard,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Stop edits');
		}
	});
}
