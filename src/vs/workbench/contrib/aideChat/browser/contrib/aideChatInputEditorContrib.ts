/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IAideChatWidgetService, IChatWidget } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { ChatInputPart } from 'vs/workbench/contrib/aideChat/browser/aideChatInputPart';
import { ChatWidget } from 'vs/workbench/contrib/aideChat/browser/aideChatWidget';
import { CodeSymbolCompletionProviderName, dynamicVariableDecorationType, FileReferenceCompletionProviderName, FolderReferenceCompletionProviderName, SelectAndInsertCodeAction, SelectAndInsertFileAction, SelectAndInsertFolderAction } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatDynamicVariables';
import { AideChatAgentLocation, IChatAgentCommand, IChatAgentData, IAideChatAgentService } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';
import { chatSlashCommandBackground, chatSlashCommandForeground } from 'vs/workbench/contrib/aideChat/common/aideChatColors';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from 'vs/workbench/contrib/aideChat/common/aideChatParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/aideChat/common/aideChatRequestParser';
import { SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { ISearchComplete, ISearchService } from 'vs/workbench/services/search/common/search';

const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const variableTextDecorationType = 'chat-variable-text';

function agentAndCommandToKey(agent: IChatAgentData, subcommand: string | undefined): string {
	return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}

class InputEditorDecorations extends Disposable {

	public readonly id = 'inputEditorDecorations';

	private readonly previouslyUsedAgents = new Set<string>();

	private readonly viewModelDisposables = this._register(new MutableDisposable());

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IAideChatAgentService private readonly chatAgentService: IAideChatAgentService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeParsedInput(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this.registerViewModelListeners();
			this.previouslyUsedAgents.clear();
			this.updateInputEditorDecorations();
		}));
		this._register(this.widget.onDidSubmitAgent((e) => {
			this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent, e.slashCommand?.name));
		}));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.updateInputEditorDecorations()));

		this.registerViewModelListeners();
	}

	private registerViewModelListeners(): void {
		this.viewModelDisposables.value = this.widget.viewModel?.onDidChange(e => {
			if (e?.kind === 'changePlaceholder' || e?.kind === 'initialize') {
				this.updateInputEditorDecorations();
			}
		});
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(variableTextDecorationType);
		this.codeEditorService.removeDecorationType(dynamicVariableDecorationType);
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);

		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.updateInputEditorDecorations();
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(inputPlaceholderForeground);
		return transparentForeground?.toString();
	}

	private async updateInputEditorDecorations() {
		const inputValue = this.widget.inputEditor.getValue();

		const viewModel = this.widget.viewModel;
		if (!viewModel) {
			return;
		}

		if (!inputValue) {
			const defaultAgent = this.chatAgentService.getDefaultAgent(this.widget.location);
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: viewModel.inputPlaceholder || (defaultAgent?.description ?? ''),
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
			return;
		}

		const parsedRequest = this.widget.parsedInput.parts;

		let placeholderDecoration: IDecorationOptions[] | undefined;
		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = parsedRequest.find((p): p is ChatRequestAgentSubcommandPart => p instanceof ChatRequestAgentSubcommandPart);
		const slashCommandPart = parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);

		const exactlyOneSpaceAfterPart = (part: IParsedChatRequestPart): boolean => {
			const partIdx = parsedRequest.indexOf(part);
			if (parsedRequest.length > partIdx + 2) {
				return false;
			}

			const nextPart = parsedRequest[partIdx + 1];
			return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === ' ';
		};

		const getRangeForPlaceholder = (part: IParsedChatRequestPart) => ({
			startLineNumber: part.editorRange.startLineNumber,
			endLineNumber: part.editorRange.endLineNumber,
			startColumn: part.editorRange.endColumn + 1,
			endColumn: 1000
		});

		const onlyAgentAndWhitespace = agentPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
		if (onlyAgentAndWhitespace) {
			// Agent reference with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, undefined));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentPart.agent.metadata.followupPlaceholder;
			if (agentPart.agent.description && exactlyOneSpaceAfterPart(agentPart)) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(agentPart),
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? agentPart.agent.metadata.followupPlaceholder : agentPart.agent.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		const onlyAgentCommandAndWhitespace = agentPart && agentSubcommandPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart);
		if (onlyAgentCommandAndWhitespace) {
			// Agent reference and subcommand with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, agentSubcommandPart.command.name));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentSubcommandPart.command.followupPlaceholder;
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(agentSubcommandPart)) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(agentSubcommandPart),
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? agentSubcommandPart.command.followupPlaceholder : agentSubcommandPart.command.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);

		const textDecorations: IDecorationOptions[] | undefined = [];
		if (agentPart) {
			const isDupe = !!this.chatAgentService.getAgents().find(other => other.name === agentPart.agent.name && other.id !== agentPart.agent.id);
			const publisher = isDupe ? `(${agentPart.agent.publisherDisplayName}) ` : '';
			const agentHover = `${publisher}${agentPart.agent.description}`;
			textDecorations.push({ range: agentPart.editorRange, hoverMessage: new MarkdownString(agentHover) });
			if (agentSubcommandPart) {
				textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
			}
		}

		if (slashCommandPart) {
			textDecorations.push({ range: slashCommandPart.editorRange });
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);

		const varDecorations: IDecorationOptions[] = [];
		const variableParts = parsedRequest.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
		for (const variable of variableParts) {
			varDecorations.push({ range: variable.editorRange });
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}
}

class InputEditorSlashCommandMode extends Disposable {
	public readonly id = 'InputEditorSlashCommandMode';

	constructor(
		private readonly widget: IChatWidget
	) {
		super();
		this._register(this.widget.onDidSubmitAgent(e => {
			this.repopulateAgentCommand(e.agent, e.slashCommand);
		}));
	}

	private async repopulateAgentCommand(agent: IChatAgentData, slashCommand: IChatAgentCommand | undefined) {
		let value: string | undefined;
		if (slashCommand && slashCommand.isSticky) {
			value = `${chatAgentLeader}${agent.name} ${chatSubcommandLeader}${slashCommand.name} `;
		} else if (agent.metadata.isSticky) {
			value = `${chatAgentLeader}${agent.name} `;
		}

		if (value) {
			this.widget.inputEditor.setValue(value);
			this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
		}
	}
}

ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);

class ChatTokenDeleter extends Disposable {

	public readonly id = 'chatTokenDeleter';

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		const parser = this.instantiationService.createInstance(ChatRequestParser);
		const inputValue = this.widget.inputEditor.getValue();
		let previousInputValue: string | undefined;
		let previousSelectedAgent: IChatAgentData | undefined;

		// A simple heuristic to delete the previous token when the user presses backspace.
		// The sophisticated way to do this would be to have a parse tree that can be updated incrementally.
		this._register(this.widget.inputEditor.onDidChangeModelContent(e => {
			if (!previousInputValue) {
				previousInputValue = inputValue;
				previousSelectedAgent = this.widget.lastSelectedAgent;
			}

			// Don't try to handle multicursor edits right now
			const change = e.changes[0];

			// If this was a simple delete, try to find out whether it was inside a token
			if (!change.text && this.widget.viewModel) {
				const previousParsedValue = parser.parseChatRequest(this.widget.viewModel.sessionId, previousInputValue, AideChatAgentLocation.Panel, { selectedAgent: previousSelectedAgent });

				// For dynamic variables, this has to happen in ChatDynamicVariableModel with the other bookkeeping
				const deletableTokens = previousParsedValue.parts.filter(p => p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashCommandPart || p instanceof ChatRequestVariablePart);
				deletableTokens.forEach(token => {
					const deletedRangeOfToken = Range.intersectRanges(token.editorRange, change.range);
					// Part of this token was deleted, or the space after it was deleted, and the deletion range doesn't go off the front of the token, for simpler math
					if (deletedRangeOfToken && Range.compareRangesUsingStarts(token.editorRange, change.range) < 0) {
						// Assume single line tokens
						const length = deletedRangeOfToken.endColumn - deletedRangeOfToken.startColumn;
						const rangeToDelete = new Range(token.editorRange.startLineNumber, token.editorRange.startColumn, token.editorRange.endLineNumber, token.editorRange.endColumn - length);
						this.widget.inputEditor.executeEdits(this.id, [{
							range: rangeToDelete,
							text: '',
						}]);
					}
				});
			}

			previousInputValue = this.widget.inputEditor.getValue();
			previousSelectedAgent = this.widget.lastSelectedAgent;
		}));
	}
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);

class FileReferenceCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}file:\\w*`, 'g'); // MUST be using `g`-flag
	private readonly fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAideChatWidgetService private readonly chatWidgetService: IAideChatWidgetService,
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
		@IAideChatWidgetService private readonly chatWidgetService: IAideChatWidgetService,
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
		@IAideChatWidgetService private readonly chatWidgetService: IAideChatWidgetService,
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

				const completionURIs = await this.doGetFolderSearchResults(_token);

				const editRange: IRange = {
					startLineNumber: position.lineNumber,
					startColumn: varWord ? varWord.startColumn : position.column,
					endLineNumber: position.lineNumber,
					endColumn: varWord ? varWord.endColumn : position.column
				};

				const completionItems = completionURIs.map(uri => {
					return <CompletionItem>{
						label: this.labelService.getUriLabel(uri, { relative: true }),
						insertText: '',
						kind: CompletionItemKind.Folder,
						range,
						command: { id: SelectAndInsertFolderAction.ID, title: SelectAndInsertFolderAction.ID, arguments: [{ widget, range: editRange, uri }] },
						sortText: 'z'
					};
				});

				return {
					suggestions: completionItems
				};
			}
		}));
	}

	private async doGetFolderSearchResults(token: CancellationToken): Promise<URI[]> {
		const response = await this.searchService.fileSearch(
			this.fileQueryBuilder.file(
				this.contextService.getWorkspace().folders,
				{
					extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
					sortByScore: true,
				}
			), token);

		const dirUris = new Map<string, URI>();
		response.results.forEach(result => {
			const dirUri = dirname(result.resource);
			dirUris.set(dirUri.toString(), dirUri);
		});
		return Array.from(dirUris.values());
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(FolderReferenceCompletions, LifecyclePhase.Eventually);
