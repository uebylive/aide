/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { CHAT_CATEGORY, stringifyItem } from '../../../../../workbench/contrib/aideChat/browser/actions/aideChatActions.js';
import { IAideChatWidgetService } from '../../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { CONTEXT_RESPONSE_FILTERED } from '../../../../../workbench/contrib/aideChat/common/aideChatContextKeys.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../../../../workbench/contrib/aideChat/common/aideChatViewModel.js';

export function registerChatCopyActions() {
	registerAction2(class CopyAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideChat.copyAll',
				title: localize2('aideChat.copyAll.label', "Copy All"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.AideChatContext,
					when: CONTEXT_RESPONSE_FILTERED.toNegated(),
					group: 'copy',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const clipboardService = accessor.get(IClipboardService);
			const chatWidgetService = accessor.get(IAideChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			if (widget) {
				const viewModel = widget.viewModel;
				const sessionAsText = viewModel?.getItems()
					.filter((item): item is (IChatRequestViewModel | IChatResponseViewModel) => isRequestVM(item) || (isResponseVM(item) && !item.errorDetails?.responseIsFiltered))
					.map(item => stringifyItem(item))
					.join('\n\n');
				if (sessionAsText) {
					clipboardService.writeText(sessionAsText);
				}
			}
		}
	});

	registerAction2(class CopyItemAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.aideChat.copyItem',
				title: localize2('aideChat.copyItem.label', "Copy"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.AideChatContext,
					when: CONTEXT_RESPONSE_FILTERED.toNegated(),
					group: 'copy',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			const text = stringifyItem(item, false);
			clipboardService.writeText(text);
		}
	});
}
