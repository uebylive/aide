/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
// import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';


class VariableCompletionsCustom extends Disposable {

	private static readonly VariableNameDef = /@\w*/g; // MUST be using `g`-flag
	public static previousDropDown: string | undefined;

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		// @IEditorService private readonly editorService: IEditorService,
	) {
		console.log('are we registered here');
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatVariables',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				const previousDropDown = VariableCompletionsCustom.previousDropDown;
				VariableCompletionsCustom.previousDropDown = undefined;
				if (!widget) {
					return null;
				}

				const varWord = getWordAtText(position.column, VariableCompletionsCustom.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					// inside a "normal" word
					return null;
				}

				let insert: Range;
				let replace: Range;
				if (!varWord) {
					insert = replace = Range.fromPositions(position);
				} else {
					insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
					replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
				}

				if (previousDropDown === 'file') {
					// TODO(skcd): Get the right files here after implementing
					// it from the editor
					return {
						suggestions: [],
					};
					// const fileLabelCompletions = [
					// 	{
					// 		label: '@someFile.txt',
					// 		filterText: '@someFile.txt',
					// 		detail: '/Users/skcd/testing/someFile.txt',
					// 		insertText: '@someFile.txt' + ' ',
					// 		kind: CompletionItemKind.Text,
					// 		range: { insert, replace },
					// 		insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					// 		command: { // Here's the new part
					// 			id: 'codestory.chat.widget.context.file', // The command we registered
					// 			title: 'Sends to the widget context',
					// 			arguments: ['/Users/skcd/testing/someFile.txt', model.uri],
					// 		},
					// 	},
					// 	{
					// 		label: '@someFileElse.txt',
					// 		filterText: '@someFileElse.txt',
					// 		detail: '/Users/skcd/testing/someFileElse.txt',
					// 		insertText: '@someFileElse.txt' + ' ',
					// 		kind: CompletionItemKind.Text,
					// 		range: { insert, replace },
					// 		insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					// 		command: { // Here's the new part
					// 			id: 'codestory.chat.widget.context.file', // The command we registered
					// 			title: 'Sends to the widget context',
					// 			arguments: ['/Users/skcd/testing/someFile.txt', model.uri],
					// 		},
					// 	},
					// 	{
					// 		label: '@something.txt',
					// 		filterText: '@something.txt',
					// 		range: { insert, replace },
					// 		insertText: '@something.txt' + ' ',
					// 		detail: 'something.txt',
					// 		kind: CompletionItemKind.Text,
					// 	},
					// 	{
					// 		label: '@somethingElse.txt',
					// 		filterText: '@somethingElse.txt',
					// 		range: { insert, replace },
					// 		insertText: '@somethingElse.txt' + ' ',
					// 		detail: 'somethingElse.txt',
					// 		kind: CompletionItemKind.Text,
					// 	},
					// ];
					// return <CompletionList>{
					// 	suggestions: [...fileLabelCompletions],
					// };
				}

				const history = widget.viewModel!.getItems()
					.filter(isResponseVM);

				// TODO@roblourens work out a real API for this- maybe it can be part of the two-step flow that @file will probably use
				const historyItems = history.map((h, i): CompletionItem => ({
					label: `@response:${i + 1}`,
					detail: h.response.asString(),
					insertText: `@response:${String(i + 1).padStart(String(history.length).length, '0')} `,
					kind: CompletionItemKind.Text,
					range: { insert, replace },
				}));

				const variableItems = Array.from(this.chatVariablesService.getVariables()).map(v => {
					const withAt = `@${v.name}`;
					return <CompletionItem>{
						label: withAt,
						range: { insert, replace },
						insertText: withAt + ' ',
						detail: v.description,
						kind: CompletionItemKind.Text, // The icons are disabled here anyway,
					};
				});

				const completionOptions = [
					{
						label: '@file',
						detail: 'Insert the contents of a file',
						insertText: '@',
						kind: CompletionItemKind.Text,
						range: { insert, replace },
						sortText: '001',
						command: { // Here's the new part
							id: 'codestory.chat.input.completion.file', // The command we registered
							title: 'Trigger File completions',
							arguments: ['file'],
						},
					},
				];

				return <CompletionList>{
					suggestions: [...variableItems, ...historyItems, ...completionOptions]
				};
			}
		}));
	}

	generateFileCompletions(insert: Range, replace: Range): CompletionItem[] {
		// const activeEditors = this.editorService.;
		const fileCompletionItemList = [
			{
				label: 'something.txt',
				range: { insert, replace },
				insertText: '${1:@{something.txt}} ',
				detail: 'something.txt',
				kind: CompletionItemKind.Text,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
			},
			{
				label: 'somethingElse.txt',
				range: { insert, replace },
				insertText: 'somethingElse.txt' + ' ',
				detail: 'somethingElse.txt',
				kind: CompletionItemKind.Text,
				insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
			},
		];
		return fileCompletionItemList;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletionsCustom, LifecyclePhase.Eventually);


CommandsRegistry.registerCommand('codestory.chat.input.completion.file', async (accessor, ...args) => {
	const editorService = accessor.get(ICodeEditorService);
	VariableCompletionsCustom.previousDropDown = 'file';
	editorService.getFocusedCodeEditor()?.trigger('keyboard', 'editor.action.triggerSuggest', {});
});


CommandsRegistry.registerCommand('codestory.chat.widget.context.file', async (accessor, ...args) => {
	console.log('[widget][context][file] what are the args');
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatWidget = chatWidgetService.getWidgetByInputUri(args[1]);
	if (chatWidget !== null) {
		console.log('[widget][context][file][present] we have a widget');
		chatWidget?.addFileContextForUserMessage(args[0]);
	} else {
		console.log('[widget][context][file][not-present] we do not have a widget');
	}
});
