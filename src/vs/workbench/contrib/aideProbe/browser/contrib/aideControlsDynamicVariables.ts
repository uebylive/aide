/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { chatVariableLeader } from '../../../../../workbench/contrib/aideProbe/common/aideProbeParserTypes.js';
import { AideControls, IAideControlsContrib } from '../../../../../workbench/contrib/aideProbe/browser/aideControls.js';
import { ISymbolQuickPickItem } from '../../../../../workbench/contrib/search/browser/symbolsQuickAccess.js';
import { IDynamicVariable } from '../../../chat/common/chatVariables.js';

export const dynamicVariableDecorationType = 'chat-dynamic-variable';

export const FolderReferenceCompletionProviderName = 'chatInplaceFolderReferenceCompletionProvider';
export const FileReferenceCompletionProviderName = 'chatInplaceFileReferenceCompletionProvider';
export const CodeSymbolCompletionProviderName = 'chatInplaceCodeCompletionProvider';

export interface IWidgetWithInputEditor {
	inputEditor: ICodeEditor;
	getContrib<T extends IAideControlsContrib>(id: string): T | undefined;
}

export class ChatDynamicVariableModel extends Disposable implements IAideControlsContrib {
	public static readonly ID = 'aideControlsDynamicVariableModel';

	private _variables: IDynamicVariable[] = [];
	get variables(): ReadonlyArray<IDynamicVariable> {
		return [...this._variables];
	}

	get id() {
		return ChatDynamicVariableModel.ID;
	}

	private _onDidChangeInputState = this._register(new Emitter<void>());
	readonly onDidChangeInputState = this._onDidChangeInputState.event;

	constructor(
		private readonly widget: IWidgetWithInputEditor,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this._register(widget.inputEditor.onDidChangeModelContent(e => {
			e.changes.forEach(c => {
				// Don't mutate entries in _variables, since they will be returned from the getter
				const originalNumVariables = this._variables.length;
				this._variables = coalesce(this._variables.map(ref => {
					const intersection = Range.intersectRanges(ref.range, c.range);
					if (intersection && !intersection.isEmpty()) {
						// The reference text was changed, it's broken.
						// But if the whole reference range was deleted (eg history navigation) then don't try to change the editor.
						if (!Range.containsRange(c.range, ref.range)) {
							const rangeToDelete = new Range(ref.range.startLineNumber, ref.range.startColumn, ref.range.endLineNumber, ref.range.endColumn - 1);
							this.widget.inputEditor.executeEdits(this.id, [{
								range: rangeToDelete,
								text: '',
							}]);
						}
						return null;
					} else if (Range.compareRangesUsingStarts(ref.range, c.range) > 0) {
						const delta = c.text.length - c.rangeLength;
						return {
							...ref,
							range: {
								startLineNumber: ref.range.startLineNumber,
								startColumn: ref.range.startColumn + delta,
								endLineNumber: ref.range.endLineNumber,
								endColumn: ref.range.endColumn + delta
							}
						};
					}

					return ref;
				}));

				if (this._variables.length !== originalNumVariables) {
					this._onDidChangeInputState.fire();
				}
			});

			this.updateDecorations();
		}));
	}

	getInputState(): any {
		return this.variables;
	}

	setInputState(s: any): void {
		if (!Array.isArray(s)) {
			s = [];
		}

		this._variables = s;
		this.updateDecorations();
	}

	addReference(ref: IDynamicVariable): void {
		this._variables.push(ref);
		this.updateDecorations();
		this._onDidChangeInputState.fire();
	}

	private updateDecorations(): void {
		this.widget.inputEditor.setDecorationsByType('aideProbe', dynamicVariableDecorationType, this._variables.map(r => (<IDecorationOptions>{
			range: r.range,
			hoverMessage: this.getHoverForReference(r)
		})));
	}

	private getHoverForReference(ref: IDynamicVariable): string | IMarkdownString {
		const value = ref.data;
		if (URI.isUri(value)) {
			return new MarkdownString(this.labelService.getUriLabel(value, { relative: true }));
		} else {
			return (value as any).toString();
		}
	}
}


AideControls.INPUT_CONTRIBS.push(ChatDynamicVariableModel);

interface MultiLevelCodeTriggerActionContext {
	inputEditor: ICodeEditor;
	range: IRange;
	pick: 'file' | 'code' | 'folder';
}

function isMultiLevelCodeTriggerActionContext(context: any): context is MultiLevelCodeTriggerActionContext {
	return 'inputEditor' in context && 'range' in context && 'pick' in context;
}

export class MultiLevelCodeTriggerAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.multiLevelCodeTrigger';

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

		const inputEditor = context.inputEditor;
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
		const completionProvider = completionProviders.find(
			provider => provider._debugDisplayName === (
				context.pick === 'code' ? CodeSymbolCompletionProviderName : context.pick === 'file' ? FileReferenceCompletionProviderName : FolderReferenceCompletionProviderName
			));

		if (!completionProvider) {
			doCleanup();
			return;
		}

		suggestController.triggerSuggest(new Set([completionProvider]));
	}
}
registerAction2(MultiLevelCodeTriggerAction);

interface SelectAndInsertFileActionContext {
	widget: IWidgetWithInputEditor;
	range: IRange;
	uri: URI;
}

function isSelectAndInsertFileActionContext(context: any): context is SelectAndInsertFileActionContext {
	return 'widget' in context && 'range' in context && 'uri' in context;
}

export class SelectAndInsertFolderAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.selectAndInsertFolder';

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

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: 'vscode.folder',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: resource
		});
	}
}
registerAction2(SelectAndInsertFolderAction);

export class SelectAndInsertFileAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.selectAndInsertFile';

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
			id: 'vscode.file',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: value
		});
	}
}
registerAction2(SelectAndInsertFileAction);

interface SelectAndInsertCodeActionContext {
	widget: IWidgetWithInputEditor;
	range: IRange;
	pick: ISymbolQuickPickItem;
}

function isSelectAndInsertCodeActionContext(context: any): context is SelectAndInsertCodeActionContext {
	return 'widget' in context && 'range' in context && 'pick' in context;
}

export class SelectAndInsertCodeAction extends Action2 {
	static readonly ID = 'workbench.action.aideProbe.selectAndInsertCode';

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
			id: 'vscode.codeSymbol',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: value
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

