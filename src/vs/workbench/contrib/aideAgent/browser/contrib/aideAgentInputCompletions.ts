/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isPatternInWord } from '../../../../../base/common/filters.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { IFileMatch, ISearchService } from '../../../../services/search/common/search.js';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from '../../../search/browser/symbolsQuickAccess.js';
import { ChatAgentLocation, IAideAgentAgentNameService, IAideAgentAgentService, IChatAgentData, getFullyQualifiedId } from '../../common/aideAgentAgents.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestVariablePart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from '../../common/aideAgentParserTypes.js';
import { IAideAgentSlashCommandService } from '../../common/aideAgentSlashCommands.js';
import { IAideAgentVariablesService, IDynamicVariable } from '../../common/aideAgentVariables.js';
import { IAideAgentLMToolsService } from '../../common/languageModelToolsService.js';
import { SubmitChatRequestAction } from '../actions/aideAgentExecuteActions.js';
import { IAideAgentWidgetService, IChatWidget } from '../aideAgent.js';
import { ChatInputPart } from '../aideAgentInputPart.js';
import { IChatWidgetCompletionContext } from '../aideAgentWidget.js';
import { ChatDynamicVariableModel } from './aideAgentDynamicVariables.js';

const chatDynamicCompletions = 'chatDynamicCompletions';

class SlashCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideAgentWidgetService private readonly chatWidgetService: IAideAgentWidgetService,
		@IAideAgentSlashCommandService private readonly chatSlashCommandService: IAideAgentSlashCommandService
	) {
		super();

		const slashCommandsCompletionProvider = {
			_debugDisplayName: 'globalSlashCommands',
			triggerCharacters: [chatSubcommandLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				const parsedRequest = widget.parsedInput.parts;
				const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
				if (usedAgent) {
					// No (classic) global slash commands when an agent is used
					return;
				}

				const slashCommands = this.chatSlashCommandService.getCommands(widget.location);
				if (!slashCommands) {
					return null;
				}

				return {
					suggestions: slashCommands.map((c, i): CompletionItem => {
						const withSlash = `/${c.command}`;
						return {
							label: withSlash,
							insertText: c.executeImmediately ? '' : `${withSlash} `,
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							sortText: c.sortText ?? 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: SubmitChatRequestAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
						};
					})
				};
			}
		};
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, slashCommandsCompletionProvider));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);

class AgentCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideAgentWidgetService private readonly chatWidgetService: IAideAgentWidgetService,
		@IAideAgentAgentService private readonly chatAgentService: IAideAgentAgentService,
		@IAideAgentAgentNameService private readonly chatAgentNameService: IAideAgentAgentNameService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgent',
			triggerCharacters: [chatAgentLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const parsedRequest = widget.parsedInput.parts;
				const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
				if (usedAgent && !Range.containsPosition(usedAgent.editorRange, position)) {
					// Only one agent allowed
					return;
				}

				const range = computeCompletionRanges(model, position, /@\w*/g);
				if (!range) {
					return null;
				}

				const agents = this.chatAgentService.getAgents()
					.filter(a => !a.isDefault)
					.filter(a => a.locations.includes(widget.location));

				return {
					suggestions: agents.map((agent, i): CompletionItem => {
						const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
						return {
							// Leading space is important because detail has no space at the start by design
							label: isDupe ?
								{ label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } :
								agentLabel,
							insertText: `${agentLabel} `,
							detail: agent.description,
							range: new Range(1, 1, 1, 1),
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent: agent, widget } satisfies AssignSelectedAgentActionArgs] },
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					})
				};
			}
		}));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentSubcommand',
			triggerCharacters: [chatSubcommandLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				const parsedRequest = widget.parsedInput.parts;
				const usedAgentIdx = parsedRequest.findIndex((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
				if (usedAgentIdx < 0) {
					return;
				}

				const usedSubcommand = parsedRequest.find(p => p instanceof ChatRequestAgentSubcommandPart);
				if (usedSubcommand) {
					// Only one allowed
					return;
				}

				for (const partAfterAgent of parsedRequest.slice(usedAgentIdx + 1)) {
					// Could allow text after 'position'
					if (!(partAfterAgent instanceof ChatRequestTextPart) || !partAfterAgent.text.trim().match(/^(\/\w*)?$/)) {
						// No text allowed between agent and subcommand
						return;
					}
				}

				const usedAgent = parsedRequest[usedAgentIdx] as ChatRequestAgentPart;
				return {
					suggestions: usedAgent.agent.slashCommands.map((c, i): CompletionItem => {
						const withSlash = `/${c.name}`;
						return {
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.description,
							range,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					})
				};
			}
		}));

		// list subcommands when the query is empty, insert agent+subcommand
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentAndSubcommand',
			triggerCharacters: [chatSubcommandLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				const viewModel = widget?.viewModel;
				if (!widget || !viewModel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				const agents = this.chatAgentService.getAgents()
					.filter(a => a.locations.includes(widget.location));

				// When the input is only `/`, items are sorted by sortText.
				// When typing, filterText is used to score and sort.
				// The same list is refiltered/ranked while typing.
				const getFilterText = (agent: IChatAgentData, command: string) => {
					// This is hacking the filter algorithm to make @terminal /explain match worse than @workspace /explain by making its match index later in the string.
					// When I type `/exp`, the workspace one should be sorted over the terminal one.
					const dummyPrefix = agent.id === 'github.copilot.terminalPanel' ? `0000` : ``;
					return `${chatSubcommandLeader}${dummyPrefix}${agent.name}.${command}`;
				};

				const justAgents: CompletionItem[] = agents
					.filter(a => !a.isDefault)
					.map(agent => {
						const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
						const detail = agent.description;

						return {
							label: isDupe ?
								{ label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } :
								agentLabel,
							detail,
							filterText: `${chatSubcommandLeader}${agent.name}`,
							insertText: `${agentLabel} `,
							range: new Range(1, 1, 1, 1),
							kind: CompletionItemKind.Text,
							sortText: `${chatSubcommandLeader}${agent.name}`,
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
						};
					});

				return {
					suggestions: justAgents.concat(
						agents.flatMap(agent => agent.slashCommands.map((c, i) => {
							const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
							const withSlash = `${chatSubcommandLeader}${c.name}`;
							const item: CompletionItem = {
								label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined },
								filterText: getFilterText(agent, c.name),
								commitCharacters: [' '],
								insertText: `${agentLabel} ${withSlash} `,
								detail: `(${agentLabel}) ${c.description ?? ''}`,
								range: new Range(1, 1, 1, 1),
								kind: CompletionItemKind.Text, // The icons are disabled here anyway
								sortText: `${chatSubcommandLeader}${agent.name}${c.name}`,
								command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
							};

							if (agent.isDefault) {
								// default agent isn't mentioned nor inserted
								item.label = withSlash;
								item.insertText = `${withSlash} `;
								item.detail = c.description;
							}

							return item;
						})))
				};
			}
		}));
	}

	private getAgentCompletionDetails(agent: IChatAgentData): { label: string; isDupe: boolean } {
		const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
		const agentLabel = `${chatAgentLeader}${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
		const isDupe = isAllowed && this.chatAgentService.agentHasDupeName(agent.id);
		return { label: agentLabel, isDupe };
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);

interface AssignSelectedAgentActionArgs {
	agent: IChatAgentData;
	widget: IChatWidget;
}

class AssignSelectedAgentAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.assignSelectedAgent';

	constructor() {
		super({
			id: AssignSelectedAgentAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const arg: AssignSelectedAgentActionArgs = args[0];
		if (!arg || !arg.widget || !arg.agent) {
			return;
		}

		arg.widget.lastSelectedAgent = arg.agent;
	}
}
registerAction2(AssignSelectedAgentAction);


class ReferenceArgument {
	constructor(
		readonly widget: IChatWidget,
		readonly variable: IDynamicVariable
	) { }
}

class BuiltinDynamicCompletions extends Disposable {
	public static readonly addReferenceCommand = '_addReferenceCmd';
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}[\\w/.-]*`, 'g'); // -g flag should always be included
	// public static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag
	private readonly workspaceSymbolsQuickAccess: SymbolsQuickAccessProvider;

	private readonly queryBuilder: QueryBuilder;
	private cacheKey?: { key: string; time: number };

	private readonly cacheScheduler: RunOnceScheduler;
	private lastPattern?: string;
	private fileEntries: IFileMatch<URI>[] = [];
	private codeEntries: ISymbolQuickPickItem[] = [];


	constructor(
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideAgentWidgetService private readonly chatWidgetService: IAideAgentWidgetService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.cacheScheduler = this._register(new RunOnceScheduler(() => {
			this.cacheFileEntries();
			this.cacheCodeEntries();
		}, 0));

		const alphabetArray: string[] = [];

		for (let i = 97; i <= 122; i++) {
			alphabetArray.push(String.fromCharCode(i)); // lowercase letters 'a' to 'z'
		}

		for (let i = 65; i <= 90; i++) {
			alphabetArray.push(String.fromCharCode(i)); // uppercase letters 'A' to 'Z'
		}
		alphabetArray.push(chatVariableLeader);
		alphabetArray.push('/');
		alphabetArray.push('.');

		const dynamicCompletionsProvider = {
			_debugDisplayName: chatDynamicCompletions,
			// this makes the completion trigger everytime no matter what we type
			// we will have to handle the case so we only trigger it when the word at the current position starts with '@'
			triggerCharacters: alphabetArray,
			// This triggers even when we do backspace but the search is broken because we are not searching for the prefix
			// we do want to show an empty suggestion box somehow or when we have a match
			provideCompletionItems: async (model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				const range = computeCompletionRanges(model, position, BuiltinDynamicCompletions.VariableNameDef, true);
				if (!range) {
					return null;
				}

				const result: CompletionList = { suggestions: [] };
				let pattern: string = '';
				if (range.varWord?.word && range.varWord.word.startsWith(chatVariableLeader)) {
					pattern = range.varWord.word.toLowerCase().slice(1); // remove leading @
				}

				// We currently trigger the same completion provider when the user selects one of the predefined
				// options like "File" or "Code". In order to support this, we set the completion context on the widget,
				// and reset it when the user is done with the current completion context and starts over again.
				const currentCompletionContext = widget.completionContext;
				if (
					currentCompletionContext !== 'default'
					&& pattern.length === 0
					&& context.triggerKind === CompletionTriggerKind.TriggerCharacter
				) {
					widget.completionContext = 'default';
				}

				if (currentCompletionContext === 'default' && (
					pattern.length === 0
					|| isPatternInWord(pattern.toLowerCase(), 0, pattern.length, 'file', 0, 4)
					|| isPatternInWord(pattern.toLowerCase(), 0, pattern.length, 'code', 0, 4)
				)) {
					this.addStaticFileEntry(widget, range, result);
					this.addStaticCodeEntry(widget, range, result);
				} else if (currentCompletionContext === 'default') {
					// run both the file entries and the code entries in parallel
					await Promise.all([this.addFileEntries(pattern, widget, result, range, token), this.addCodeEntries(pattern, widget, result, range, token)]);
				} else if (currentCompletionContext === 'files') {
					await this.addFileEntries(pattern, widget, result, range, token);
				} else if (currentCompletionContext === 'code') {
					await this.addCodeEntries(pattern, widget, result, range, token);
				}

				this.lastPattern = pattern;
				// mark results as incomplete because further typing might yield
				// in more search results
				result.incomplete = true;

				// cache the entries for the next completion
				this.cacheScheduler.schedule();
				if (result.suggestions.length === 0) {
					result.suggestions.push({
						label: 'No results found',
						kind: CompletionItemKind.Text,
						filterText: `${chatVariableLeader}${pattern}`,
						insertText: 'No results found',
						range: range.insert,
					});
				}
				return result;
			}
		};
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, dynamicCompletionsProvider));

		this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions.addReferenceCommand, (_services, arg) => this.cmdAddReference(arg)));
		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.workspaceSymbolsQuickAccess = this.instantiationService.createInstance(SymbolsQuickAccessProvider);
		this.cacheScheduler.schedule();
	}

	private addStaticFileEntry(widget: IChatWidget, range: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, result: CompletionList) {
		result.suggestions.push({
			label: 'File',
			filterText: `${chatVariableLeader}file`,
			insertText: `${chatVariableLeader}`,
			detail: localize('pickFileLabel', "Pick a file"),
			range,
			kind: CompletionItemKind.File,
			sortText: 'z',
			command: { id: TriggerSecondaryChatWidgetCompletionAction.ID, title: TriggerSecondaryChatWidgetCompletionAction.ID, arguments: [{ widget, range: range.replace, pick: 'files' } satisfies TriggerSecondaryChatWidgetCompletionContext] }
		});
	}

	private addStaticCodeEntry(widget: IChatWidget, range: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, result: CompletionList) {
		result.suggestions.push({
			label: 'Code',
			filterText: `${chatVariableLeader}code`,
			insertText: `${chatVariableLeader}`,
			detail: localize('pickCodeSymbolLabel', "Pick a code symbol"),
			range,
			kind: CompletionItemKind.Reference,
			sortText: 'z',
			command: { id: TriggerSecondaryChatWidgetCompletionAction.ID, title: TriggerSecondaryChatWidgetCompletionAction.ID, arguments: [{ widget, range: range.replace, pick: 'code' } satisfies TriggerSecondaryChatWidgetCompletionContext] }
		});
	}

	private async cacheFileEntries() {
		if (this.cacheKey && Date.now() - this.cacheKey.time > 60000) {
			this.searchService.clearCache(this.cacheKey.key);
			this.cacheKey = undefined;
		}

		if (!this.cacheKey) {
			this.cacheKey = {
				key: generateUuid(),
				time: Date.now()
			};
		}

		this.cacheKey.time = Date.now();

		const query = this.queryBuilder.file(this.workspaceContextService.getWorkspace().folders, {
			filePattern: this.lastPattern,
			sortByScore: true,
			maxResults: 250,
			cacheKey: this.cacheKey.key
		});

		const data = await this.searchService.fileSearch(query, CancellationToken.None);
		this.fileEntries = data.results;
	}

	private async cacheCodeEntries() {
		const editorSymbolPicks = await this.workspaceSymbolsQuickAccess.getSymbolPicks(this.lastPattern ?? '', undefined, CancellationToken.None);
		this.codeEntries = editorSymbolPicks;
	}

	private async addFileEntries(pattern: string, widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {
		const makeFileCompletionItem = async (resource: URI): Promise<CompletionItem> => {
			const basename = this.labelService.getUriBasenameLabel(resource);
			const fullName = this.labelService.getUriLabel(resource);
			const filterText = `${chatVariableLeader}${fullName}`;
			const insertText = `${chatVariableLeader}${basename} `;
			// if the model is null then we create a special range which is very very special
			// and is filled with 42s
			// this is a special variableId which signifies that we are not setting the range
			// to full file length over here, since creating the model using
			// IModelSerivce.createModel('') sets the file content to ''
			// which was a frequent bug we were noticing when developing
			const variableId = 'vscode.file.rangeNotSetProperlyFullFile';
			const range = new Range(42, 42, 42, 42);

			return {
				label: { label: basename, description: this.labelService.getUriLabel(resource, { relative: true }) },
				filterText: filterText,
				insertText,
				range: info,
				kind: CompletionItemKind.File,
				sortText: '{', // after `z`
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: variableId,
						range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + insertText.length },
						data: {
							uri: resource,
							range
						}
					})]
				}
			};
		};

		const seen = new ResourceSet();
		const len = result.suggestions.length;

		// HISTORY
		// always take the last N items
		for (const item of this.historyService.getHistory()) {
			if (!item.resource || !this.workspaceContextService.getWorkspaceFolder(item.resource)) {
				// ignore "forgein" editors
				continue;
			}

			if (pattern) {
				// use pattern if available
				const basename = this.labelService.getUriBasenameLabel(item.resource).toLowerCase();
				if (!isPatternInWord(pattern, 0, pattern.length, basename, 0, basename.length)) {
					continue;
				}
			}

			seen.add(item.resource);
			const newLen = result.suggestions.push(await makeFileCompletionItem(item.resource));
			if (newLen - len >= 5) {
				break;
			}
		}

		// SEARCH
		// use file search when having a pattern
		if (pattern) {
			for (const match of this.fileEntries) {
				if (seen.has(match.resource)) {
					// already included via history
					continue;
				}
				result.suggestions.push(await makeFileCompletionItem(match.resource));
			}
		}
	}

	private async addCodeEntries(pattern: string, widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {
		let entries = this.codeEntries;
		if (pattern.length > 0) {
			const editorSymbolPicks = this.codeEntries = await this.workspaceSymbolsQuickAccess.getSymbolPicks(pattern, { skipSorting: true }, token);
			entries = editorSymbolPicks;
		}

		for (const pick of entries) {
			const label = pick.label;
			const uri = pick.symbol?.location.uri;
			const range = pick.symbol?.location.range;
			// if any of this is null, then hard continue, we do not want to send
			// nullable data to the extension
			if (uri === undefined || range === undefined) {
				continue;
			}
			// label looks like `$(symbol-type) symbol-name`, but we want to insert `@symbol-name `.
			// with a space
			const insertText = `${chatVariableLeader}${label.replace(/^\$\([^)]+\) /, '')} `;
			result.suggestions.push({
				label: pick,
				filterText: `${chatVariableLeader}${pick.label}`,
				insertText,
				range: info,
				kind: CompletionItemKind.Text,
				sortText: '{', // after `z`
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: 'vscode.code',
						range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + insertText.length },
						data: {
							uri,
							range,
						}
					})]
				}
			});
		}
	}

	private cmdAddReference(arg: ReferenceArgument) {
		// invoked via the completion command
		arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

interface TriggerSecondaryChatWidgetCompletionContext {
	widget: IChatWidget;
	range: IRange;
	pick: IChatWidgetCompletionContext;
}

function isTriggerSecondaryChatWidgetCompletionContext(context: any): context is TriggerSecondaryChatWidgetCompletionContext {
	return 'widget' in context && 'range' in context && 'pick' in context;
}

export class TriggerSecondaryChatWidgetCompletionAction extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.triggerSecondaryChatWidgetCompletion';

	constructor() {
		super({
			id: TriggerSecondaryChatWidgetCompletionAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);

		const context = args[0];
		if (!isTriggerSecondaryChatWidgetCompletionContext(context)) {
			return;
		}

		const widget = context.widget;
		if (!widget.supportsFileReferences) {
			return;
		}
		widget.completionContext = context.pick;

		const inputEditor = widget.inputEditor;

		const suggestController = SuggestController.get(inputEditor);
		if (!suggestController) {
			return;
		}

		const completionProviders = languageFeaturesService.completionProvider.getForAllLanguages();
		const completionProvider = completionProviders.find(provider => provider._debugDisplayName === chatDynamicCompletions);
		if (!completionProvider) {
			return;
		}

		suggestController.triggerSuggest(new Set([completionProvider]));
	}
}
registerAction2(TriggerSecondaryChatWidgetCompletionAction);

function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp, onlyOnWordStart = false): {
	insert: Range;
	replace: Range;
	varWord: IWordAtPosition | null;
} | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}
	if (varWord && onlyOnWordStart) {
		const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
		if (wordBefore.word) {
			// inside a word
			return;
		}
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}

class VariableCompletions extends Disposable {

	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideAgentWidgetService private readonly chatWidgetService: IAideAgentWidgetService,
		@IAideAgentVariablesService private readonly chatVariablesService: IAideAgentVariablesService,
		@IConfigurationService configService: IConfigurationService,
		@IAideAgentLMToolsService toolsService: IAideAgentLMToolsService
	) {
		super();

		const chatVariablesProvider = {
			_debugDisplayName: 'chatVariables',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const locations = new Set<ChatAgentLocation>();
				locations.add(ChatAgentLocation.Panel);

				for (const value of Object.values(ChatAgentLocation)) {
					if (typeof value === 'string' && configService.getValue<boolean>(`chat.experimental.variables.${value}`)) {
						locations.add(value);
					}
				}

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !locations.has(widget.location)) {
					return null;
				}

				const range = computeCompletionRanges(model, position, VariableCompletions.VariableNameDef, true);
				if (!range) {
					return null;
				}

				const usedAgent = widget.parsedInput.parts.find(p => p instanceof ChatRequestAgentPart);
				const slowSupported = usedAgent ? usedAgent.agent.metadata.supportsSlowVariables : true;

				const usedVariables = widget.parsedInput.parts.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
				const usedVariableNames = new Set(usedVariables.map(v => v.variableName));
				const variableItems = Array.from(this.chatVariablesService.getVariables(widget.location))
					// This doesn't look at dynamic variables like `file`, where multiple makes sense.
					.filter(v => !usedVariableNames.has(v.name))
					.filter(v => !v.isSlow || slowSupported)
					.map((v): CompletionItem => {
						const withLeader = `${chatVariableLeader}${v.name}`;
						return {
							label: withLeader,
							range,
							insertText: withLeader + ' ',
							detail: v.description,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							sortText: 'z'
						};
					});

				const usedTools = widget.parsedInput.parts.filter((p): p is ChatRequestToolPart => p instanceof ChatRequestToolPart);
				const usedToolNames = new Set(usedTools.map(v => v.toolName));
				const toolItems: CompletionItem[] = [];
				if (!usedAgent || usedAgent.agent.supportsToolReferences) {
					toolItems.push(...Array.from(toolsService.getTools())
						.filter(t => t.canBeInvokedManually)
						.filter(t => !usedToolNames.has(t.name ?? ''))
						.map((t): CompletionItem => {
							const withLeader = `${chatVariableLeader}${t.name}`;
							return {
								label: withLeader,
								range,
								insertText: withLeader + ' ',
								detail: t.userDescription,
								kind: CompletionItemKind.Text,
								sortText: 'z'
							};
						}));
				}

				return {
					suggestions: [...variableItems, ...toolItems]
				};
			}
		};
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, chatVariablesProvider));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletions, LifecyclePhase.Eventually);
