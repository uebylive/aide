/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IAideAgentCodeEditingService } from '../../common/aideAgentCodeEditingService.js';
import { CONTEXT_IN_CHAT_INPUT } from '../../common/aideAgentContextKeys.js';
import { CHAT_CATEGORY } from './aideAgentChatActions.js';

export function registerCodeEditActions() {
	registerAction2(class AcceptAllAction extends Action2 {
		static readonly ID = 'aideAgent.acceptAll';

		constructor() {
			super({
				id: AcceptAllAction.ID,
				title: localize2('aideAgent.acceptAll', "Accept all"),
				f1: false,
				category: CHAT_CATEGORY,
				keybinding: {
					when: CONTEXT_IN_CHAT_INPUT,
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					weight: KeybindingWeight.EditorContrib
				},
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const exchangeId = args[0];

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(exchangeId);
			editingSession.accept();
		}
	});

	registerAction2(class RejectAllAction extends Action2 {
		static readonly ID = 'aideAgent.rejectAll';

		constructor() {
			super({
				id: RejectAllAction.ID,
				title: localize2('aideAgent.rejectAll', "Reject all"),
				f1: false,
				category: CHAT_CATEGORY,
				keybinding: {
					when: CONTEXT_IN_CHAT_INPUT,
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					weight: KeybindingWeight.EditorContrib
				},
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const exchangeId = args[0];

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(exchangeId);
			editingSession.reject();
		}
	});
}
