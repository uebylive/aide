/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatWidget } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/csChat/browser/csChatWidget';
import { chatFileVariableLeader, chatSymbolVariableLeader } from 'vs/workbench/contrib/csChat/common/csChatParserTypes';
import { IDynamicReference } from 'vs/workbench/contrib/csChat/common/csChatVariables';
import { ISymbolQuickPickItem } from 'vs/workbench/contrib/search/browser/symbolsQuickAccess';

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
						widget.inputEditor.executeEdits('referenceEditCallback', [{ range: ref.range, text: `` }]);
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


interface InsertFileVariableContext {
	widget: ChatWidget;
	range: IRange;
	uri: URI;
}

function isInsertFileVariableContext(context: any): context is InsertFileVariableContext {
	return 'widget' in context && 'range' in context && 'uri' in context;
}

interface InsertSymbolVariableContext {
	widget: ChatWidget;
	range: IRange;
	pick: ISymbolQuickPickItem;
}

function isInsertSymbolVariableContext(context: any): context is InsertSymbolVariableContext {
	return 'widget' in context && 'range' in context && 'pick' in context;
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
		if (!isInsertFileVariableContext(context)) {
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
		const text = `${chatFileVariableLeader}file:${fileName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertFile', [{ range, text: text + '' }]);
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

export class SelectAndInsertCodeSymbolAction extends Action2 {
	static readonly ID = 'workbench.action.csChat.selectAndInsertCodeSymbol';

	constructor() {
		super({
			id: SelectAndInsertCodeSymbolAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const logService = accessor.get(ILogService);

		const context = args[0];
		if (!isInsertSymbolVariableContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertCode', [{ range: context.range, text: `` }]);
		};

		const pick = context.pick;
		if (!pick || !pick.resource) {
			logService.trace('SelectAndInsertCodeSymbolAction: no resource selected');
			doCleanup();
			return;
		}

		const selectionRange = (pick as unknown as { range: Range }).range;
		const result = parseVariableInfo(pick.label);
		if (!result) {
			logService.trace('SelectAndInsertCodeSymbolAction: failed to parse code symbol');
			doCleanup();
			return;
		}

		const [symbolName, symbolType] = result;
		const editor = context.widget.inputEditor;
		const text = `${chatSymbolVariableLeader}${symbolType}:${symbolName}`;
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
				uri: pick.resource,
				range: selectionRange
			}
		});
	}
}
registerAction2(SelectAndInsertCodeSymbolAction);
