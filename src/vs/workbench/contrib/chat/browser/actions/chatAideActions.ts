/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { CodeSymbolCompletionProviderName, FileReferenceCompletionProviderName } from 'vs/workbench/contrib/chat/browser/contrib/csChatDynamicVariables';
import { CONTEXT_IN_AIDE_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export class InsertContextTrigger extends Action2 {
	static readonly ID = 'workbench.action.chat.insertContextTrigger';

	constructor() {
		super({
			id: InsertContextTrigger.ID,
			title: localize2('interactive.insertContextTrigger.label', "Add context (#)"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.symbolNumeric,
			menu: [
				{
					id: MenuId.ChatAideActions,
					when: CONTEXT_IN_AIDE_CHAT_SESSION,
					group: 'navigation',
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const viewsService = accessor.get(IViewsService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);

		const chatWidget = await showChatView(viewsService);
		if (!chatWidget) {
			return;
		}

		const inputEditor = chatWidget.inputEditor;
		const suggestController = SuggestController.get(inputEditor);
		if (!suggestController) {
			return;
		}

		const completionProviders = languageFeaturesService.completionProvider.getForAllLanguages();
		const filteredProviders = completionProviders.filter(
			provider =>
				provider._debugDisplayName !== CodeSymbolCompletionProviderName
				&& provider._debugDisplayName !== FileReferenceCompletionProviderName
		);
		if (!filteredProviders) {
			return;
		}

		// get the current position from chatWidget and insert the context
		const position = inputEditor.getPosition();
		if (!position) {
			return;
		}
		const range = {
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		};

		inputEditor.executeEdits('insertContextTrigger', [{ range, text: '#' }]);
		chatWidget.focusInput();
		suggestController.triggerSuggest(new Set(filteredProviders));
	}
}

export function registerChatAideActions() {
	registerAction2(InsertContextTrigger);
}
