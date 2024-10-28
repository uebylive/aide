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
import { IAideAgentService } from '../../common/aideAgentService.js';
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

		/**
		 * TODO(codestory): When we accept here, if any of the previous exchanges
		 * which were not accepted also go into accepted state cause we build up
		 * incrementally and there is no branching
		 */
		run(accessor: ServicesAccessor, ...args: any[]) {
			const exchangeId = args[0];
			const sessionId = args[1];

			try {
				const aideAgentSession = accessor.get(IAideAgentService);
				aideAgentSession.handleUserActionForSession(args[1], exchangeId, undefined, args[2], args[3]);
			} catch (exception) {
				console.error(exception);
			}

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
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
			const sessionId = args[1];

			try {
				const aideAgentSession = accessor.get(IAideAgentService);
				// to understand about args[1], args[2], args[3], grep for `aideAgent.rejectAll`
				// and see how these values are passed
				aideAgentSession.handleUserActionForSession(sessionId, exchangeId, undefined, args[2], args[3]);
			} catch (exception) {
				console.error(exception);
			}

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(sessionId);
			// we reject all the changes which are related to this exchange and not
			// the ones related to the previous one
			// Note: this is an async function so the GC will not clear it when we
			// go out of scope over here in the `run` function
			editingSession.rejectForExchange(args[1], exchangeId);
		}
	});
}
