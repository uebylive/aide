/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IAideChatWidgetService } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { ChatDynamicVariableModel } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatDynamicVariables';
import { IChatModel, IChatRequestVariableData, IAideChatRequestVariableEntry } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { ChatRequestDynamicVariablePart, ChatRequestVariablePart, IParsedChatRequest } from 'vs/workbench/contrib/aideChat/common/aideChatParserTypes';
import { IAideChatContentReference } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { IAideChatRequestVariableValue, IAideChatVariableData, IChatVariableResolver, IAideChatVariableResolverProgress, IAideChatVariablesService, IDynamicVariable } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';

interface IChatData {
	data: IAideChatVariableData;
	resolver: IChatVariableResolver;
}

export class ChatVariablesService implements IAideChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, IChatData>();

	constructor(
		@IAideChatWidgetService private readonly chatWidgetService: IAideChatWidgetService
	) {
	}

	async resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IAideChatRequestVariableEntry[] | undefined, model: IChatModel, progress: (part: IAideChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData> {
		let resolvedVariables: IAideChatRequestVariableEntry[] = [];
		const jobs: Promise<any>[] = [];

		prompt.parts
			.forEach((part, i) => {
				if (part instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(part.variableName.toLowerCase());
					if (data) {
						const references: IAideChatContentReference[] = [];
						const variableProgressCallback = (item: IAideChatVariableResolverProgress) => {
							if (item.kind === 'reference') {
								references.push(item);
								return;
							}
							progress(item);
						};
						jobs.push(data.resolver(prompt.text, part.variableArg, model, variableProgressCallback, token).then(value => {
							if (value) {
								resolvedVariables[i] = { id: data.data.id, modelDescription: data.data.modelDescription, name: part.variableName, range: part.range, value, references };
							}
						}).catch(onUnexpectedExternalError));
					}
				} else if (part instanceof ChatRequestDynamicVariablePart) {
					resolvedVariables[i] = { id: part.id, name: part.referenceText, range: part.range, value: part.data };
				}
			});

		const resolvedAttachedContext: IAideChatRequestVariableEntry[] = [];
		attachedContextVariables
			?.forEach((attachment, i) => {
				const data = this._resolver.get(attachment.name?.toLowerCase());
				if (data) {
					const references: IAideChatContentReference[] = [];
					const variableProgressCallback = (item: IAideChatVariableResolverProgress) => {
						if (item.kind === 'reference') {
							references.push(item);
							return;
						}
						progress(item);
					};
					jobs.push(data.resolver(prompt.text, '', model, variableProgressCallback, token).then(value => {
						if (value) {
							resolvedAttachedContext[i] = { id: data.data.id, modelDescription: data.data.modelDescription, name: attachment.name, range: attachment.range, value, references };
						}
					}).catch(onUnexpectedExternalError));
				} else if (attachment.isDynamic) {
					resolvedAttachedContext[i] = { id: attachment.id, name: attachment.name, value: attachment.value };
				}
			});

		await Promise.allSettled(jobs);

		resolvedVariables = coalesce<IAideChatRequestVariableEntry>(resolvedVariables);

		// "reverse", high index first so that replacement is simple
		resolvedVariables.sort((a, b) => b.range!.start - a.range!.start);
		resolvedVariables.push(...resolvedAttachedContext);

		return {
			variables: resolvedVariables,
		};
	}

	async resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IAideChatVariableResolverProgress) => void, token: CancellationToken): Promise<IAideChatRequestVariableValue | undefined> {
		const data = this._resolver.get(variableName.toLowerCase());
		if (!data) {
			return undefined;
		}

		return (await data.resolver(promptText, undefined, model, progress, token));
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariable(name: string): IAideChatVariableData | undefined {
		return this._resolver.get(name.toLowerCase())?.data;
	}

	getVariables(): Iterable<Readonly<IAideChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => !data.hidden);
	}

	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		return model.variables;
	}

	registerVariable(data: IAideChatVariableData, resolver: IChatVariableResolver): IDisposable {
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
