/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { Command } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IGotoSymbolQuickPickItem } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ISymbolQuickPickItem } from '../../../search/browser/symbolsQuickAccess.js';
import { ChatAgentLocation } from '../../common/aideAgentAgents.js';
import { chatVariableLeader } from '../../common/aideAgentParserTypes.js';
import { IAideAgentVariablesService } from '../../common/aideAgentVariables.js';
import { showChatView } from '../aideAgent.js';
import { CHAT_CATEGORY } from './aideAgentActions.js';

export function registerChatContextActions() {
	registerAction2(AttachFileAction);
	registerAction2(AttachSelectionAction);
	registerAction2(TriggerContextProvider);
}

export type IChatContextQuickPickItem = IFileQuickPickItem | IDynamicVariableQuickPickItem | IStaticVariableQuickPickItem | IGotoSymbolQuickPickItem | ISymbolQuickPickItem | IQuickAccessQuickPickItem | IToolQuickPickItem;

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

export interface IToolQuickPickItem extends IQuickPickItem {
	kind: 'tool';
	id: string;
	name?: string;
	icon?: ThemeIcon;
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

	static readonly ID = 'workbench.action.aideAgent.attachFile';

	constructor() {
		super({
			id: AttachFileAction.ID,
			title: localize2('workbench.action.aideAgent.attachFile.label', "Attach File"),
			category: CHAT_CATEGORY,
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IAideAgentVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			variablesService.attachContext('file', activeUri, ChatAgentLocation.Panel);
		}
	}
}

class AttachSelectionAction extends Action2 {

	static readonly ID = 'workbench.action.aideAgent.attachSelection';

	constructor() {
		super({
			id: AttachSelectionAction.ID,
			title: localize2('workbench.action.aideAgent.attachSelection.label', "Add Selection to Chat"),
			category: CHAT_CATEGORY,
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const variablesService = accessor.get(IAideAgentVariablesService);
		const textEditorService = accessor.get(IEditorService);

		const activeEditor = textEditorService.activeTextEditorControl;
		const activeUri = textEditorService.activeEditor?.resource;
		if (textEditorService.activeTextEditorControl?.getEditorType() === EditorType.ICodeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
			const selection = activeEditor?.getSelection();
			if (selection) {
				variablesService.attachContext('file', { uri: activeUri, range: selection }, ChatAgentLocation.Panel);
			}
		}
	}
}

class TriggerContextProvider extends Action2 {
	static readonly ID = 'workbench.action.aideAgent.triggerContextProvider';

	constructor() {
		super({
			id: TriggerContextProvider.ID,
			title: localize2('workbench.action.aideAgent.triggerContextProvider.label', "Add context"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: {
				light: FileAccess.asFileUri('vs/workbench/contrib/aideAgent/browser/aideAgentContentParts/media/at-light.svg'),
				dark: FileAccess.asFileUri('vs/workbench/contrib/aideAgent/browser/aideAgentContentParts/media/at-dark.svg'),
			},
			menu: [
				{
					id: MenuId.AideAgentInput,
					group: 'navigation',
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
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

		inputEditor.executeEdits('insertContextTrigger', [{ range, text: chatVariableLeader }]);
		chatWidget.focusInput();
		suggestController.triggerSuggest(new Set(completionProviders));
	}
}
