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
					group: 'navigation',
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


	registerAction2(class SeeEditsAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.seeEdits',
				title: localize2('interactiveSession.seeEdits.label', "See edits"),
				menu: {
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 1
				},
				icon: Codicon.diffMultiple,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('See edits');
		}
	});


	registerAction2(class ProvideFeebackAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.provideFeedback',
				title: localize2('interactiveSession.provideFeedback.label', "Provide feedback"),
				menu: [{
					id: MenuId.AideAgentEditsLoading,
					group: 'navigation',
					order: 0
				}, {
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 0
				}],
				icon: Codicon.commentDiscussion,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Provide feedback on edits');
		}
	});


	registerAction2(class AcceptAll extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.acceptAll',
				title: localize2('interactiveSession.acceptAll.label', "Accept all edits"),
				menu: {
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 1
				},
				icon: Codicon.checkAll,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Stop edits');
		}
	});

	registerAction2(class RejectAll extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideAgent.rejectAll',
				title: localize2('interactiveSession.rejectAll.label', "Reject all edits"),
				menu: {
					id: MenuId.AideAgentEditsReview,
					group: 'navigation',
					order: 2
				},
				icon: Codicon.closeAll,
				f1: false,
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			console.log('Stop edits');
		}
	});
}
