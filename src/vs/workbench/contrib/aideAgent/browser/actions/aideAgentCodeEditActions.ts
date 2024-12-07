/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { SAVE_FILES_COMMAND_ID } from '../../../files/browser/fileConstants.js';
import { IAideAgentCodeEditingService } from '../../common/aideAgentCodeEditingService.js';
import { CONTEXT_CHAT_INPUT_HAS_FOCUS, CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE } from '../../common/aideAgentContextKeys.js';
import { IAideAgentService } from '../../common/aideAgentService.js';
import { isAideAgentEditPreviewContext } from '../aideAgentEditPreviewWidget.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export function registerCodeEditActions() {
	registerAction2(class SaveAllAction extends Action2 {
		static readonly ID = 'aideAgent.saveAll';

		constructor() {
			super({
				id: SaveAllAction.ID,
				title: localize2('aideAgent.saveAll', "Save all"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.saveAll,
				precondition: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE,
				keybinding: {
					when: ContextKeyExpr.and(CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE, CONTEXT_CHAT_INPUT_HAS_FOCUS),
					primary: KeyMod.CtrlCmd | KeyCode.KeyS,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.AideAgentEditPreviewWidget,
					group: 'navigation',
					order: 0,
					when: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const commandService = accessor.get(ICommandService);
			commandService.executeCommand(SAVE_FILES_COMMAND_ID);
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
				icon: Codicon.closeAll,
				precondition: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE,
				keybinding: {
					when: ContextKeyExpr.and(CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE, CONTEXT_CHAT_INPUT_HAS_FOCUS),
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.AideAgentEditPreviewWidget,
					group: 'navigation',
					order: 1,
					when: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const aideAgentService = accessor.get(IAideAgentService);
			let exchangeId = aideAgentService.lastExchangeId;
			if (!exchangeId) {
				const context = args[0];
				if (isAideAgentEditPreviewContext(context)) {
					exchangeId = context.exchangeId;
				}
				return;
			}

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(exchangeId);
			editingSession.reject();
		}
	});

	registerAction2(class AcceptAllAction extends Action2 {
		static readonly ID = 'aideAgent.acceptAll';

		constructor() {
			super({
				id: AcceptAllAction.ID,
				title: localize2('aideAgent.acceptAll', "Accept all"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.checkAll,
				precondition: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE,
				keybinding: {
					when: ContextKeyExpr.and(CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE, CONTEXT_CHAT_INPUT_HAS_FOCUS),
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib,
				},
				menu: {
					id: MenuId.AideAgentEditPreviewWidget,
					group: 'navigation',
					order: 2,
					when: CONTEXT_CHAT_LAST_EXCHANGE_COMPLETE
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const aideAgentService = accessor.get(IAideAgentService);
			let exchangeId = aideAgentService.lastExchangeId;
			if (!exchangeId) {
				const context = args[0];
				if (isAideAgentEditPreviewContext(context)) {
					exchangeId = context.exchangeId;
				}
				return;
			}

			const aideAgentCodeEditingService = accessor.get(IAideAgentCodeEditingService);
			const editingSession = aideAgentCodeEditingService.getOrStartCodeEditingSession(exchangeId);
			editingSession.accept();
		}
	});
}
