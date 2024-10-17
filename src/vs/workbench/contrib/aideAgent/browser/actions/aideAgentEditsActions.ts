/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';

export function registerChatEditsActions() {
	registerAction2(class StopEditsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.stopEdits',
				title: localize2('interactiveSession.stopEdits.label', "Stop edits"),
				menu: {
					id: MenuId.AideAgentEditsLoading,
					order: 2
				},
				icon: Codicon.stopCircle,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Stop edits');
		}
	});
}
