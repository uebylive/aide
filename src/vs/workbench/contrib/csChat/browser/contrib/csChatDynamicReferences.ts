/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/resources';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IChatWidget } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/csChat/browser/csChatWidget';
import { chatVariableLeader } from 'vs/workbench/contrib/csChat/common/csChatParserTypes';
import { IDynamicReference } from 'vs/workbench/contrib/csChat/common/csChatVariables';

export const dynamicReferenceDecorationType = 'chat-dynamic-reference';

export class ChatDynamicReferenceModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicReferenceModel';

	private readonly _references: IDynamicReference[] = [];
	get references(): ReadonlyArray<IDynamicReference> {
		return [...this._references];
	}

	get id() {
		return ChatDynamicReferenceModel.ID;
	}

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
		this._register(widget.inputEditor.onDidChangeModelContent(e => {
			e.changes.forEach(c => {
				this._references.forEach((ref, i) => {
					if (Range.areIntersecting(ref.range, c.range)) {
						// The reference text was changed, it's broken
						this._references.splice(i, 1);
					} else if (Range.compareRangesUsingStarts(ref.range, c.range) > 0) {
						const delta = c.text.length - c.rangeLength;
						ref.range = {
							startLineNumber: ref.range.startLineNumber,
							startColumn: ref.range.startColumn + delta,
							endLineNumber: ref.range.endLineNumber,
							endColumn: ref.range.endColumn + delta
						};
					}
				});
			});

			this.updateReferences();
		}));
	}

	addReference(ref: IDynamicReference): void {
		this._references.push(ref);
		this.updateReferences();
	}

	private updateReferences(): void {
		this.widget.inputEditor.setDecorationsByType('chat', dynamicReferenceDecorationType, this._references.map(r => (<IDecorationOptions>{
			range: r.range,
			hoverMessage: new MarkdownString(this.labelService.getUriLabel(r.data.uri, { relative: true }))
		})));
	}
}

ChatWidget.CONTRIBS.push(ChatDynamicReferenceModel);


interface SelectAndInsertActionContext {
	widget: ChatWidget;
	range: IRange;
}

function isSelectAndInsertActionContext(context: any): context is SelectAndInsertActionContext {
	return 'widget' in context && 'range' in context;
}

export class SelectAndInsertFileAction extends Action2 {
	static readonly ID = 'workbench.action.csChat.selectAndInsertFile';

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
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertFile', [{ range: context.range, text: `` }]);
		};

		const resource = context.widget.inputEditor.getModel()?.uri;
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

		context.widget.getContrib<ChatDynamicReferenceModel>(ChatDynamicReferenceModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: {
				uri: resource,
				range: fileRange
			}
		});
	}
}
registerAction2(SelectAndInsertFileAction);

const parseVariableInfo = (input: string): [string, string] | null => {
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

export class SelectAndInsertCodeSymbolAction extends Action2 {
	static readonly ID = 'workbench.action.csChat.selectAndInsertCodeSymbol';

	constructor() {
		super({
			id: SelectAndInsertCodeSymbolAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const textModelService = accessor.get(ITextModelService);
		const logService = accessor.get(ILogService);
		const codeEditorService = accessor.get(ICodeEditorService);

		const activeEditor = codeEditorService.getActiveCodeEditor();
		const model = activeEditor?.getModel();
		if (!activeEditor || !model) {
			return;
		}

		const context = args[0];
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertCode', [{ range: context.range, text: `` }]);
		};

		const uri = model.uri;
		if (!textModelService.canHandleResource(uri)) {
			logService.trace('SelectAndInsertCodeSymbolAction: non-text resource selected');
			doCleanup();
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const picks = await quickInputService.quickAccess.pick('@');
		if (!picks?.length) {
			logService.trace('SelectAndInsertCodeSymbolAction: no code symbol selected');
			doCleanup();
			return;
		}

		const pick = picks[0];
		const selectionRange = (pick as unknown as { range: Range }).range;
		const result = parseVariableInfo(pick.label);
		if (!result) {
			logService.trace('SelectAndInsertCodeSymbolAction: failed to parse code symbol');
			doCleanup();
			return;
		}

		const [symbolName, symbolType] = result;
		const editor = context.widget.inputEditor;
		const text = `${chatVariableLeader}${symbolType}:${symbolName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertCode', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertSymbolAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicReferenceModel>(ChatDynamicReferenceModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: {
				uri,
				range: selectionRange
			}
		});
	}
}
registerAction2(SelectAndInsertCodeSymbolAction);
