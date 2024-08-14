/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Schemas } from 'vs/base/common/network';
import { IRange } from 'vs/editor/common/core/range';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Command } from 'vs/editor/common/languages';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from 'vs/editor/contrib/quickAccess/browser/gotoSymbolQuickAccess';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { AnythingQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { AnythingQuickAccessProvider } from 'vs/workbench/contrib/search/browser/anythingQuickAccess';
import { ISymbolQuickPickItem, SymbolsQuickAccessProvider } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorType } from 'vs/editor/common/editorCommon';
import { compare } from 'vs/base/common/strings';
import { IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';


const AIDE_CONTEXT_CATEGORY = localize2('chat.category', 'Chat');

export function registerContextActions() {
	registerAction2(AttachContextAction);
	registerAction2(AttachFileAction);
	registerAction2(AttachSelectionAction);
}

export type IChatContextQuickPickItem = IFileQuickPickItem | IDynamicVariableQuickPickItem | IStaticVariableQuickPickItem | IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickAccessQuickPickItem;

export interface IFileQuickPickItem extends IQuickPickItem {
	kind: 'file';
	id: string;
	name: string;
	value: URI;
	isDynamic: true;

	resource: URI;
}

export interface IDynamicVariableQuickPickItem extends IQuickPickItem {
	kind: 'dynamic';
	id: string;
	name?: string;
	value: unknown;
	isDynamic: true;

	icon?: ThemeIcon;
	command?: Command;
}

export interface IStaticVariableQuickPickItem extends IQuickPickItem {
	kind: 'static';
	id: string;
	name: string;
	value: unknown;
	isDynamic?: false;

	icon?: ThemeIcon;
}

export interface IQuickAccessQuickPickItem extends IQuickPickItem {
	kind: 'quickaccess';
	id: string;
	name: string;
	value: string;

	prefix: string;
}

class AttachFileAction extends Action2 {

	static readonly ID = 'workbench.action.aideControls.attachFile';

	constructor() {
		super({
			id: AttachFileAction.ID,
			title: localize2('workbench.action.aideControls.attachFile.label', "Attach File"),
			category: AIDE_CONTEXT_CATEGORY,
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		//const variablesService = accessor.get(IChatVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote].includes(activeUri.scheme)) {
			//variablesService.attachContext('file', activeUri, ChatAgentLocation.Panel);
		}
	}
}

class AttachSelectionAction extends Action2 {

	static readonly ID = 'workbench.action.aideControls.attachSelection';

	constructor() {
		super({
			id: AttachSelectionAction.ID,
			title: localize2('workbench.action.aideControls.attachSelection.label', "Add Selection to Chat"),
			category: AIDE_CONTEXT_CATEGORY,
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		//const variablesService = accessor.get(IChatVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeEditor = textEditorService.activeTextEditorControl;
		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote].includes(activeUri.scheme)) {
			const selection = activeEditor?.getSelection();
			if (selection) {
				//variablesService.attachContext('file', { uri: activeUri, range: selection }, ChatAgentLocation.Panel);
			}
		}
	}
}

export class AttachContextAction extends Action2 {

	static readonly ID = 'workbench.action.aideControls.attachContext';

	constructor() {
		super({
			id: AttachContextAction.ID,
			title: localize2('workbench.action.aideControls.attachContext.label', "Attach Context"),
			icon: Codicon.attach,
			category: AIDE_CONTEXT_CATEGORY,
			menu: [
				{
					//when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.Panel), CONTEXT_IN_QUICK_CHAT.isEqualTo(false)),
					id: MenuId.ChatExecute,
					group: 'navigation',
				},
			]
		});
	}

	private _getFileContextId(item: { resource: URI } | { uri: URI; range: IRange }) {
		if ('resource' in item) {
			return item.resource.toString();
		}

		return item.uri.toString() + (item.range.startLineNumber !== item.range.endLineNumber ?
			`:${item.range.startLineNumber}-${item.range.endLineNumber}` :
			`:${item.range.startLineNumber}`);
	}

	private async _attachContext(commandService: ICommandService, ...picks: IChatContextQuickPickItem[]) {
		const toAttach: IVariableEntry[] = [];
		for (const pick of picks) {
			if (pick && typeof pick === 'object' && 'command' in pick && pick.command) {
				// Dynamic variable with a followup command
				const selection = await commandService.executeCommand(pick.command.id, ...(pick.command.arguments ?? []));
				if (!selection) {
					// User made no selection, skip this variable
					continue;
				}
				toAttach.push({
					...pick,
					isDynamic: pick.isDynamic,
					value: pick.value,
					name: `${typeof pick.value === 'string' && pick.value.startsWith('#') ? pick.value.slice(1) : ''}${selection}`,
					// Apply the original icon with the new name
					fullName: `${pick.icon ? `$(${pick.icon.id}) ` : ''}${selection}`
				});
			} else if ('symbol' in pick && pick.symbol) {
				// Symbol
				toAttach.push({
					...pick,
					id: this._getFileContextId(pick.symbol.location),
					value: pick.symbol.location,
					fullName: pick.label,
					name: pick.symbol.name,
					isDynamic: true
				});
			} else if (pick && typeof pick === 'object' && 'resource' in pick && pick.resource) {
				// #file variable
				toAttach.push({
					...pick,
					id: this._getFileContextId({ resource: pick.resource }),
					value: JSON.stringify({
						'uri': pick.resource,
						range: {
							startLineNumber: 0,
							startColumn: 0,
							endLineNumber: 0,
							endColumn: 0
						}
					}),
					// we need to prepend `file:` to the name of the variable
					name: 'file:' + pick.label,
					isFile: true,
					isDynamic: true
				});
			} else if ('symbolName' in pick && pick.uri && pick.range) {
				// Symbol
				toAttach.push({
					...pick,
					range: undefined,
					id: this._getFileContextId({ uri: pick.uri, range: pick.range.decoration }),
					value: { uri: pick.uri, range: pick.range.decoration },
					fullName: pick.label,
					name: pick.symbolName!,
					isDynamic: true
				});
			} else {
				// All other dynamic variables and static variables
				toAttach.push({
					...pick,
					range: undefined,
					id: pick.id ?? '',
					value: 'value' in pick ? pick.value : undefined,
					fullName: pick.label,
					name: 'name' in pick && typeof pick.name === 'string' ? pick.name : pick.label,
					icon: 'icon' in pick && ThemeIcon.isThemeIcon(pick.icon) ? pick.icon : undefined
				});
			}
		}
		return toAttach;
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<IVariableEntry[] | undefined> {
		const quickInputService = accessor.get(IQuickInputService);
		const chatVariablesService = accessor.get(IChatVariablesService);
		const commandService = accessor.get(ICommandService);

		const quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[] = [];
		for (const variable of chatVariablesService.getVariables()) {
			if (variable.fullName && !variable.isSlow) {
				quickPickItems.push({
					label: `${variable.icon ? `$(${variable.icon.id}) ` : ''}${variable.fullName}`,
					name: variable.name,
					id: variable.id,
					icon: variable.icon
				});
			}
		}

		quickPickItems.push({
			label: localize('chatContext.symbol', '{0} Symbol...', `$(${Codicon.symbolField.id})`),
			icon: ThemeIcon.fromId(Codicon.symbolField.id),
			prefix: SymbolsQuickAccessProvider.PREFIX
		});

		function extractTextFromIconLabel(label: string | undefined): string {
			if (!label) {
				return '';
			}
			const match = label.match(/\$\([^\)]+\)\s*(.+)/);
			return match ? match[1] : label;
		}

		const newEntries = await this._show(quickInputService, commandService, quickPickItems.sort(function (a, b) {

			const first = extractTextFromIconLabel(a.label).toUpperCase();
			const second = extractTextFromIconLabel(b.label).toUpperCase();

			return compare(first, second);
		}));
		return newEntries;
	}

	private async _show(quickInputService: IQuickInputService, commandService: ICommandService, quickPickItems: (IChatContextQuickPickItem | QuickPickItem)[], query: string = '', currentContext?: IVariableEntry[]): Promise<IVariableEntry[] | undefined> {
		return new Promise(resolve => {
			quickInputService.quickAccess.show(query, {
				enabledProviderPrefixes: [
					AnythingQuickAccessProvider.PREFIX,
					SymbolsQuickAccessProvider.PREFIX,
					AbstractGotoSymbolQuickAccessProvider.PREFIX
				],
				placeholder: localize('chatContext.attach.placeholder', 'Search attachments'),
				providerOptions: <AnythingQuickAccessProviderRunOptions>{
					handleAccept: async (item: IChatContextQuickPickItem) => {
						if ('prefix' in item) {
							resolve(await this._show(quickInputService, commandService, quickPickItems, item.prefix));
						} else {
							resolve(await this._attachContext(commandService, item));
						}
					},
					//additionPicks: quickPickItems,
					filter: (item: IChatContextQuickPickItem) => {
						// Avoid attaching the same context twice
						const attachedContext = new Set(currentContext?.map((v) => v.id));

						if ('symbol' in item && item.symbol) {
							return !attachedContext.has(this._getFileContextId(item.symbol.location));
						}

						if (item && typeof item === 'object' && 'resource' in item && URI.isUri(item.resource)) {
							return [Schemas.file, Schemas.vscodeRemote].includes(item.resource.scheme)
								&& !attachedContext.has(this._getFileContextId({ resource: item.resource })); // Hack because Typescript doesn't narrow this type correctly
						}

						if (item && typeof item === 'object' && 'uri' in item && item.uri && item.range) {
							return !attachedContext.has(this._getFileContextId({ uri: item.uri, range: item.range.decoration }));
						}

						if (!('command' in item) && item.id) {
							return !attachedContext.has(item.id);
						}

						// Don't filter out dynamic variables which show secondary data (temporary)
						return true;
					}
				}
			});
		});
	}
}
