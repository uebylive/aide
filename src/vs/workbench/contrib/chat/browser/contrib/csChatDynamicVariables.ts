/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { IRange } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize2 } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatWidget, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatDynamicVariableModel } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ISymbolQuickPickItem } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export const FolderReferenceCompletionProviderName = 'chatInplaceFolderReferenceCompletionProvider';
export const FileReferenceCompletionProviderName = 'chatInplaceFileReferenceCompletionProvider';
export const CodeSymbolCompletionProviderName = 'chatInplaceCodeCompletionProvider';

interface MultiLevelCodeTriggerActionContext {
	widget: IChatWidget;
	range: IRange;
	pick: 'file' | 'code' | 'folder';
}

function isMultiLevelCodeTriggerActionContext(context: any): context is MultiLevelCodeTriggerActionContext {
	return 'widget' in context && 'range' in context && 'pick' in context;
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
			// Failed, remove the dangling prefix
			inputEditor.executeEdits('chatMultiLevelCodeTrigger', [{ range: context.range, text: `` }]);
		};

		const suggestController = SuggestController.get(inputEditor);
		if (!suggestController) {
			doCleanup();
			return;
		}

		const completionProviders = languageFeaturesService.completionProvider.getForAllLanguages();
		const codeSymbolCompletionProvider = completionProviders.find(
			provider => provider._debugDisplayName === (
				context.pick === 'code' ? CodeSymbolCompletionProviderName : context.pick === 'file' ? FileReferenceCompletionProviderName : FolderReferenceCompletionProviderName
			));

		if (!codeSymbolCompletionProvider) {
			doCleanup();
			return;
		}

		suggestController.triggerSuggest(new Set([codeSymbolCompletionProvider]));
	}
}
registerAction2(MultiLevelCodeTriggerAction);

interface SelectAndInsertFileActionContext {
	widget: IChatWidget;
	range: IRange;
	uri: URI;
}

function isSelectAndInsertFileActionContext(context: any): context is SelectAndInsertFileActionContext {
	return 'widget' in context && 'range' in context && 'uri' in context;
}

export class SelectAndInsertFolderAction extends Action2 {
	static readonly ID = 'workbench.action.chat.csSelectAndInsertFolder';

	constructor() {
		super({
			id: SelectAndInsertFolderAction.ID,
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
			// Failed, remove the dangling `folder`
			context.widget.inputEditor.executeEdits('chatInsertFolder', [{ range: context.range, text: `` }]);
		};

		const resource = context.uri;
		if (!resource) {
			logService.trace('SelectAndInsertFolderAction: no resource selected');
			doCleanup();
			return;
		}

		const fileName = basename(resource);
		const editor = context.widget.inputEditor;
		const text = `${chatVariableLeader}folder:${fileName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertFolder', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFolderAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		const valueObj = { uri: resource };
		const value = JSON.stringify(valueObj);
		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: [{ level: 'full', value, kind: 'folder' }]
		});
	}
}
registerAction2(SelectAndInsertFolderAction);

export class SelectAndInsertFileAction extends Action2 {
	static readonly ID = 'workbench.action.chat.csSelectAndInsertFile';

	constructor() {
		super({
			id: SelectAndInsertFileAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const textModelService = accessor.get(ITextModelService);
		const logService = accessor.get(ILogService);

		const context = args[0];
		if (!isSelectAndInsertFileActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertFile', [{ range: context.range, text: `` }]);
		};

		const resource = context.uri;
		if (!resource) {
			logService.trace('SelectAndInsertFileAction: no resource selected');
			doCleanup();
			return;
		}

		const model = await textModelService.createModelReference(resource);
		const fileRange = model.object.textEditorModel.getFullModelRange();
		model.dispose();

		const fileName = basename(resource);
		const editor = context.widget.inputEditor;
		const text = `${chatVariableLeader}file:${fileName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertFile', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFileAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		const valueObj = { uri: resource, range: fileRange };
		const value = JSON.stringify(valueObj);
		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: [{ level: 'full', value, kind: 'file' }]
		});
	}
}
registerAction2(SelectAndInsertFileAction);

interface SelectAndInsertCodeActionContext {
	widget: IChatWidget;
	range: IRange;
	pick: ISymbolQuickPickItem;
}

function isSelectAndInsertCodeActionContext(context: any): context is SelectAndInsertCodeActionContext {
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
		if (!isSelectAndInsertCodeActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `code`
			context.widget.inputEditor.executeEdits('chatInsertCode', [{ range: context.range, text: `` }]);
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
			logService.trace(`SelectAndInsertCodeAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		const valueObj = { uri: pick.resource, range: selectionRange };
		const value = JSON.stringify(valueObj);
		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: [{ level: 'full', value, kind: 'code' }]
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

class ChatAddContext extends EditorAction2 {
	static readonly ID = 'workbench.action.chat.addContext';

	constructor() {
		super({
			id: ChatAddContext.ID,
			title: localize2({ key: 'actions.chat.addContext', comment: ['Add context to the chat input box'] }, "Add Context"),
			precondition: CONTEXT_CHAT_ENABLED,
			keybinding: {
				when: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const viewsService = accessor.get(IViewsService);

		const chatWidget = await showChatView(viewsService);
		const editorModel = editor.getModel();
		if (!editorModel || !chatWidget) {
			return;
		}

		// get the current position from chatWidget and insert the context
		const position = chatWidget.inputEditor.getPosition();
		if (!position) {
			return;
		}
		const range = {
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		};

		const editorUri = editorModel.uri;
		const selectedRange = editor.getSelection();
		if (editorUri && !selectedRange?.isEmpty() && selectedRange) {
			const fileName = basename(editorUri);
			let text = `${chatVariableLeader}file:${fileName}`;

			if (selectedRange.startLineNumber === selectedRange.endLineNumber) {
				text += `:${selectedRange.startLineNumber}`;
			} else {
				text += `:${selectedRange.startLineNumber}-${selectedRange.endLineNumber}`;
			}

			const success = chatWidget.inputEditor.executeEdits('chatAddContext', [{ range, text: text + ' ' }]);
			if (!success) {
				return;
			}

			const valueObj = { uri: editorUri, range: selectedRange };
			const value = JSON.stringify(valueObj);
			chatWidget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
				range: { ...range, endColumn: range.endColumn + text.length },
				data: [{ level: 'full', value, kind: 'selection' }]
			});

			chatWidget.focusInput();
		}
	}
}
registerAction2(ChatAddContext);
