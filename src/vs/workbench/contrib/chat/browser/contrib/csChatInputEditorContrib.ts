/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { computeCompletionRanges } from 'vs/workbench/contrib/chat/browser/contrib/chatInputEditorContrib';
import { CodeSymbolCompletionProviderName, MultiLevelCodeTriggerAction, SelectAndInsertCodeAction } from 'vs/workbench/contrib/chat/browser/contrib/csChatDynamicVariables';
import { chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class CSBuiltinDynamicCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag
	private readonly workspaceSymbolsQuickAccess = this.instantiationService.createInstance(SymbolsQuickAccessProvider);

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.workspaceSymbolsQuickAccess.getSymbolPicks('', undefined, CancellationToken.None);

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatDynamicCompletions',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				const range = computeCompletionRanges(model, position, CSBuiltinDynamicCompletions.VariableNameDef);
				if (!range) {
					return null;
				}

				const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#code:'.length);
				return <CompletionList>{
					suggestions: [
						<CompletionItem>{
							label: `${chatVariableLeader}code`,
							insertText: `${chatVariableLeader}code:`,
							detail: localize('pickCodeSymbolLabel', "Pick a code symbol"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ widget, range: afterRange }] },
							sortText: 'z'
						}
					]
				};
			}
		}));
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CSBuiltinDynamicCompletions, LifecyclePhase.Eventually);

class CodeSymbolCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}code:\\w*`, 'g'); // MUST be using `g`-flag
	private readonly workspaceSymbolsQuickAccess = this.instantiationService.createInstance(SymbolsQuickAccessProvider);

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: CodeSymbolCompletionProviderName,
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				const varWord = getWordAtText(position.column, CodeSymbolCompletions.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					return null;
				}

				const range: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.endColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const prefixWord = `${chatVariableLeader}code:`;
				const query = varWord ? varWord.word.substring(prefixWord.length) : '';
				const editorSymbolPicks = await this.workspaceSymbolsQuickAccess.getSymbolPicks(query, undefined, CancellationToken.None);
				if (!editorSymbolPicks.length) {
					return null;
				}

				const editRange: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.startColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};
				return {
					incomplete: true,
					suggestions: editorSymbolPicks.map(pick => ({
						label: pick.label,
						insertText: '',
						detail: pick.resource ? basenameOrAuthority(pick.resource) : '',
						kind: CompletionItemKind.Text,
						range,
						command: { id: SelectAndInsertCodeAction.ID, title: SelectAndInsertCodeAction.ID, arguments: [{ widget, range: editRange, pick }] },
						sortText: 'z'
					} satisfies CompletionItem)),
				};
			}
		}));
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CodeSymbolCompletions, LifecyclePhase.Eventually);
