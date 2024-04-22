/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { computeCompletionRanges } from 'vs/workbench/contrib/chat/browser/contrib/chatInputEditorContrib';
import { CodeSymbolCompletionProviderName, FileReferenceCompletionProviderName, FolderReferenceCompletionProviderName, MultiLevelCodeTriggerAction, SelectAndInsertCodeAction, SelectAndInsertFileAction } from 'vs/workbench/contrib/chat/browser/contrib/csChatDynamicVariables';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { ISearchComplete, ISearchService } from 'vs/workbench/services/search/common/search';

class CSBuiltinDynamicCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag
	private readonly workspaceSymbolsQuickAccess = this.instantiationService.createInstance(SymbolsQuickAccessProvider);

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
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

				if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)?.id !== 'aide') {
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
							label: `${chatVariableLeader}file`,
							insertText: `${chatVariableLeader}file:`,
							detail: localize('pickFileReferenceLabel', "Pick a file"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ widget, range: afterRange, pick: 'file' }] },
							sortText: 'z'
						},
						<CompletionItem>{
							label: `${chatVariableLeader}code`,
							insertText: `${chatVariableLeader}code:`,
							detail: localize('pickCodeSymbolLabel', "Pick a code symbol"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ widget, range: afterRange, pick: 'code' }] },
							sortText: 'z'
						},
						<CompletionItem>{
							label: `${chatVariableLeader}folder`,
							insertText: `${chatVariableLeader}folder:`,
							detail: localize('pickFolderReferenceLabel', "Pick a folder"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ widget, range: afterRange, pick: 'folder' }] },
							sortText: 'z'
						}
					]
				};
			}
		}));
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CSBuiltinDynamicCompletions, LifecyclePhase.Eventually);

class FileReferenceCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}file:\\w*`, 'g'); // MUST be using `g`-flag
	private readonly fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: FileReferenceCompletionProviderName,
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const varWord = getWordAtText(position.column, FileReferenceCompletions.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					return null;
				}

				const range: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.endColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const files = await this.doGetFileSearchResults(_token);
				const completionURIs = files.results.map(result => result.resource);

				const editRange: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.startColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const completionItems = completionURIs.map(uri => {
					const detail = this.labelService.getUriLabel(dirname(uri), { relative: true });
					return <CompletionItem>{
						label: basenameOrAuthority(uri),
						insertText: '',
						detail,
						kind: CompletionItemKind.File,
						range,
						command: { id: SelectAndInsertFileAction.ID, title: SelectAndInsertFileAction.ID, arguments: [{ widget, range: editRange, uri }] },
						sortText: 'z'
					};
				});

				return {
					suggestions: completionItems
				};
			}
		}));
	}

	private doGetFileSearchResults(token: CancellationToken): Promise<ISearchComplete> {
		return this.searchService.fileSearch(
			this.fileQueryBuilder.file(
				this.contextService.getWorkspace().folders,
				{
					extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
					sortByScore: true,
				}
			), token);
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(FileReferenceCompletions, LifecyclePhase.Eventually);


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
				if (!widget) {
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


class FolderReferenceCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}folder:\\w*`, 'g'); // MUST be using `g`-flag
	private readonly fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: FolderReferenceCompletionProviderName,
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const varWord = getWordAtText(position.column, FolderReferenceCompletions.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					return null;
				}

				const range: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.endColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const files = await this.doGetFolderSearchResults(_token);
				const completionURIs = files.results.map(result => result.resource);

				const editRange: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.startColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const completionItems = completionURIs.map(uri => {
					const detail = this.labelService.getUriLabel(dirname(uri), { relative: true });
					return <CompletionItem>{
						label: basenameOrAuthority(uri),
						insertText: '',
						detail,
						kind: CompletionItemKind.Folder,
						range,
						command: { id: SelectAndInsertFileAction.ID, title: SelectAndInsertFileAction.ID, arguments: [{ widget, range: editRange, uri }] },
						sortText: 'z'
					};
				});

				return {
					suggestions: completionItems
				};
			}
		}));
	}

	private doGetFolderSearchResults(token: CancellationToken): Promise<ISearchComplete> {
		return this.searchService.fileSearch(
			this.fileQueryBuilder.file(
				this.contextService.getWorkspace().folders,
				{
					extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
					sortByScore: true,
					filePattern: '*/',
				}
			), token);
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(FolderReferenceCompletions, LifecyclePhase.Eventually);
