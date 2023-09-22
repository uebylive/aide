/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionList, DocumentSymbol, SymbolKind } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';


class VariableCompletionsCustom extends Disposable {

	private static readonly VariableNameDef = /@\w*/g; // MUST be using `g`-flag
	public static previousDropDown: string | undefined;

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
	) {
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

				// If we are selecting file, then we go with looking at the
				// active files and selecting that
				if (previousDropDown === 'file') {
					const activeEditors = this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
					const completionItems: CompletionItem[] = [];
					activeEditors.forEach((editor) => {
						if (editor.editor.resource) {
							const pathBaseName = editor.editor.resource.path.split('/').pop();
							if (pathBaseName) {
								completionItems.push({
									label: '@' + pathBaseName,
									filterText: '@' + pathBaseName,
									detail: editor.editor.resource.path,
									insertText: '@' + pathBaseName + ' ',
									kind: CompletionItemKind.File,
									range: { insert, replace },
									insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
									command: {
										id: 'codestory.chat.widget.context.file',
										title: 'Sends to the widget context',
										arguments: [model.uri, editor.editor.resource.path],
									}
								});
							}
						}
					});
					return {
						suggestions: completionItems,
					};
				}
				// If we are selecting from the code symbols, for now lets only
				// look at the active files and grab the symbols from there
				if (previousDropDown === 'documentSymbol') {
					const activeEditors = this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
					// const completionItems: CompletionItem[] = [];
					const completionItems: CompletionItem[] = [];
					for (let activeEditorIndex = 0; activeEditorIndex < activeEditors.length; activeEditorIndex++) {
						let alreadyAdded = false;
						const fileUri = activeEditors[activeEditorIndex].editor.resource;
						if (activeEditors[activeEditorIndex].editor.resource === undefined) {
							continue;
						}
						const document = this.modelService.getModel(activeEditors[activeEditorIndex].editor.resource!);
						if (!document || !fileUri) {
							continue;
						}
						const providers = languageFeaturesService.documentSymbolProvider.getForAllLanguages();
						for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
							if (alreadyAdded) {
								continue;
							}
							const symbols = await Promise.race([
								providers[providerIndex].provideDocumentSymbols(document, CancellationToken.None),
								timeout(3000)
							]);
							if (symbols) {
								alreadyAdded = true;
								symbols.forEach((symbol) => {
									// now we want to convert these symbols to the completion items
									completionItems.push(...convertDocumentSymbolToCodeSymbolInformation(symbol, 'global', true, insert, replace, model.uri, fileUri.fsPath));
								});
							}
						}
					}
					return {
						suggestions: completionItems,
					};
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
						label: `@file`,
						filterText: `@file`,
						detail: 'File ->',
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
					{
						label: '@code',
						filterText: '@code',
						detail: 'Code ->',
						insertText: '@',
						kind: CompletionItemKind.Text,
						range: { insert, replace },
						sortText: '002',
						command: {
							id: 'codestory.chat.input.completion.documentSymbol',
							title: 'Trigger documentSymbol completions',
							arguments: ['documentSymbol'],
						}
					}
				];

				return <CompletionList>{
					suggestions: [...variableItems, ...historyItems, ...completionOptions]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletionsCustom, LifecyclePhase.Eventually);


CommandsRegistry.registerCommand('codestory.chat.input.completion.file', async (accessor, ...args) => {
	const editorService = accessor.get(ICodeEditorService);
	VariableCompletionsCustom.previousDropDown = 'file';
	console.log('[trigger][filecompletion]');
	editorService.getFocusedCodeEditor()?.trigger('keyboard', 'editor.action.triggerSuggest', {});
});


CommandsRegistry.registerCommand('codestory.chat.input.completion.documentSymbol', async (accessor, ...args) => {
	VariableCompletionsCustom.previousDropDown = 'documentSymbol';
	const editorService = accessor.get(ICodeEditorService);
	console.log('[trigger][documentSymbol]');
	editorService.getFocusedCodeEditor()?.trigger('keyboard', 'editor.action.triggerSuggest', {});
});


CommandsRegistry.registerCommand('codestory.chat.widget.context.file', async (accessor, ...args) => {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatWidget = chatWidgetService.getWidgetByInputUri(args[0]);
	if (chatWidget !== null) {
		chatWidget?.addFileContextForUserMessage(args[1]);
	}
});


CommandsRegistry.registerCommand('codestory.chat.widget.context.documentSymbol', async (accessor, ...args) => {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatWidget = chatWidgetService.getWidgetByInputUri(args[0]);
	if (chatWidget !== null) {
		chatWidget?.addCodeSymbolContextForUserMessage(args[1], args[2], args[3], args[4]);
	}
});


// Helper function to convert document symbol to completion item and get more
// context on what command to pass
function convertDocumentSymbolToCodeSymbolInformation(
	documentSymbol: DocumentSymbol,
	scope: string = 'global',
	extractChildren: boolean = true,
	insert: Range,
	replace: Range,
	modelUri: URI,
	filePath: string,
): CompletionItem[] {
	// For now I will look at the child of the class and see what I can get
	const codeSymbols: CompletionItem[] = [];
	if (documentSymbol.kind === SymbolKind.Class && extractChildren) {
		if (documentSymbol.children) {
			for (let index = 0; index < documentSymbol.children.length; index++) {
				const childSymbol = documentSymbol.children[index];
				if (childSymbol.kind === SymbolKind.Method) {
					codeSymbols.push(
						...convertDocumentSymbolToCodeSymbolInformation(
							childSymbol,
							'class_function',
							false,
							insert,
							replace,
							modelUri,
							filePath,
						)
					);
				}
			}
		}
	}

	const codeSymbolCompletionItem: CompletionItem = {
		label: documentSymbol.name,
		filterText: '@' + documentSymbol.name + ' ',
		detail: documentSymbol.detail,
		insertText: '@' + documentSymbol.name + ' ',
		kind: CompletionItemKind.Text,
		range: { insert, replace },
		sortText: '003',
		// TODO(skcd): Fill this in properly later on
		command: {
			id: 'codestory.chat.widget.context.documentSymbol',
			title: 'Trigger documentSymbol completions',
			arguments: [modelUri, filePath, documentSymbol.range.startLineNumber, documentSymbol.range.endLineNumber, documentSymbol.name],
		}
	};
	return [codeSymbolCompletionItem, ...codeSymbols];
}
