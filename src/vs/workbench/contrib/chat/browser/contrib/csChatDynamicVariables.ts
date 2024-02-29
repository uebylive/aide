/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from 'vs/editor/common/core/range';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatDynamicVariableModel } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISymbolQuickPickItem } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';

export const CodeSymbolCompletionProviderName = 'chatInplaceCodeCompletionProvider';

interface MultiLevelCodeTriggerActionContext {
	widget: IChatWidget;
	range: IRange;
}

function isMultiLevelCodeTriggerActionContext(context: any): context is MultiLevelCodeTriggerActionContext {
	return 'widget' in context && 'range' in context;
}

export class MultiLevelCodeTriggerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.multiLevelCodeTrigger';

	constructor() {
		super({
			id: MultiLevelCodeTriggerAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);

		const context = args[0];
		if (!isMultiLevelCodeTriggerActionContext(context)) {
			return;
		}

		const inputEditor = context.widget.inputEditor;
		const doCleanup = () => {
			// Failed, remove the dangling `code`
			inputEditor.executeEdits('chatMultiLevelCodeTrigger', [{ range: context.range, text: `` }]);
		};

		const suggestController = SuggestController.get(inputEditor);
		if (!suggestController) {
			doCleanup();
			return;
		}

		const completionProviders = languageFeaturesService.completionProvider.getForAllLanguages();
		const codeSymbolCompletionProvider = completionProviders.find(provider => provider._debugDisplayName === CodeSymbolCompletionProviderName);
		if (!codeSymbolCompletionProvider) {
			doCleanup();
			return;
		}

		suggestController.triggerSuggest(new Set([codeSymbolCompletionProvider]));
	}
}
registerAction2(MultiLevelCodeTriggerAction);

interface SelectAndInsertCodeActionContext {
	widget: IChatWidget;
	range: IRange;
	pick: ISymbolQuickPickItem;
}

function isSelectAndInsertFileActionContext(context: any): context is SelectAndInsertCodeActionContext {
	return 'widget' in context && 'range' in context && 'pick' in context;
}

export class SelectAndInsertCodeAction extends Action2 {
	static readonly ID = 'workbench.action.chat.selectAndInsertCode';

	constructor() {
		super({
			id: SelectAndInsertCodeAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const logService = accessor.get(ILogService);

		const context = args[0];
		if (!isSelectAndInsertFileActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertFile', [{ range: context.range, text: `` }]);
		};

		const pick = context.pick;
		if (!pick || !pick.resource) {
			logService.trace('SelectAndInsertCodeAction: no resource selected');
			doCleanup();
			return;
		}

		const selectionRange = pick.symbol?.location.range;
		const result = parseVariableInfo(pick.label);
		if (!result || !selectionRange) {
			logService.trace('SelectAndInsertCodeAction: failed to parse code symbol');
			doCleanup();
			return;
		}

		const [symbolName, symbolType] = result;
		const editor = context.widget.inputEditor;
		const text = `${chatVariableLeader}${symbolType}:${symbolName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertCode', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFileAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: [{ level: 'full', value: text }]
		});
	}
}
registerAction2(SelectAndInsertCodeAction);

export const parseVariableInfo = (input: string): [string, string] | null => {
	// Define a regular expression pattern to match the variable declaration.
	const pattern = /\$\(([^)]+)\)\s*(\w+)/;

	// Use the regular expression to match and capture the variable type and name.
	const match = input.match(pattern);

	if (match) {
		// The first captured group (match[1]) is the variable type.
		// The second captured group (match[2]) is the variable name.
		let variableType = match[1];
		const variableName = match[2];

		// Remove the "symbol-" part from the variable type.
		variableType = variableType.replace(/^symbol-/, '');

		return [variableName, variableType];
	}

	// Return null if no match is found.
	return null;
};
