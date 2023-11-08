/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IParsedChatRequest, ChatRequestVariablePart, ChatRequestDynamicReferencePart } from 'vs/workbench/contrib/csChat/common/csChatParserTypes';
import { IChatRequestVariableValue, IChatVariableData, IChatVariableResolveResult, IDynamicReference, IInlineChatVariableResolver, IInlineCSChatVariablesService } from 'vs/workbench/contrib/csChat/common/csChatVariables';
import { ChatDynamicReferenceModel } from 'vs/workbench/contrib/inlineCSChat/browser/contrib/inlineCSChatDynamicReferences';
import { InlineChatController } from 'vs/workbench/contrib/inlineCSChat/browser/inlineCSChatController';

interface IChatData {
	data: IChatVariableData;
	resolver: IInlineChatVariableResolver;
}

export class InlineCSChatVariablesService implements IInlineCSChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, IChatData>();

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
	}

	async resolveVariables(prompt: IParsedChatRequest, token: CancellationToken): Promise<IChatVariableResolveResult> {
		const resolvedVariables: Record<string, IChatRequestVariableValue[]> = {};
		const jobs: Promise<any>[] = [];

		const parsedPrompt: string[] = [];
		prompt.parts
			.forEach((part, i) => {
				if (part instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(part.variableName.toLowerCase());
					if (data) {
						jobs.push(data.resolver(prompt.text, part.variableArg, token).then(value => {
							if (value) {
								resolvedVariables[part.variableName] = value;
								parsedPrompt[i] = `[${part.text}](values:${part.variableName})`;
							} else {
								parsedPrompt[i] = part.promptText;
							}
						}).catch(onUnexpectedExternalError));
					}
				} else if (part instanceof ChatRequestDynamicReferencePart) {
					// Maybe the dynamic reference should include a full IChatRequestVariableValue[] at the time it is inserted?
					resolvedVariables[part.referenceText] = [{ level: 'full', value: JSON.stringify({ uri: part.data.uri.toString(), range: part.data.range }) }];
					parsedPrompt[i] = part.promptText;
				} else {
					parsedPrompt[i] = part.promptText;
				}
			});

		await Promise.allSettled(jobs);

		return {
			variables: resolvedVariables,
			prompt: parsedPrompt.join('').trim()
		};
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => !data.hidden);
	}

	getDynamicReferences(): ReadonlyArray<IDynamicReference> {
		const codeEditor = this.codeEditorService.getActiveCodeEditor();
		if (!codeEditor) {
			return [];
		}

		const widget = InlineChatController.get(codeEditor)?.getWidget();
		if (!widget) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicReferenceModel>(ChatDynamicReferenceModel.ID);
		if (!model) {
			return [];
		}

		return model.references;
	}

	registerVariable(data: IChatVariableData, resolver: IInlineChatVariableResolver): IDisposable {
		const key = data.name.toLowerCase();
		if (this._resolver.has(key)) {
			throw new Error(`A chat variable with the name '${data.name}' already exists.`);
		}
		this._resolver.set(key, { data, resolver });
		return toDisposable(() => {
			this._resolver.delete(key);
		});
	}
}
