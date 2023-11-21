/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatModel } from 'vs/workbench/contrib/csChat/common/csChatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/csChat/common/csChatParserTypes';

export interface ICSChatVariableData {
	name: string;
	description: string;
	hidden?: boolean;
	canTakeArgument?: boolean;
}

export interface ICSChatRequestVariableValue {
	level: 'short' | 'medium' | 'full';
	value: string;
	description?: string;
}

export interface IChatVariableResolver {
	// TODO should we spec "zoom level"
	(messageText: string, arg: string | undefined, model: IChatModel, token: CancellationToken): Promise<ICSChatRequestVariableValue[] | undefined>;
}

export const ICSChatVariablesService = createDecorator<ICSChatVariablesService>('ICSChatVariablesService');

export interface ICSChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: ICSChatVariableData, resolver: IChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariables(): Iterable<Readonly<ICSChatVariableData>>;
	getDynamicReferences(sessionId: string): ReadonlyArray<IDynamicReference>; // should be its own service?

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, model: IChatModel, token: CancellationToken): Promise<IChatVariableResolveResult>;
}

export interface IInlineChatVariableResolver {
	// TODO should we spec "zoom level"
	(messageText: string, arg: string | undefined, token: CancellationToken): Promise<ICSChatRequestVariableValue[] | undefined>;
}

export const IInlineCSChatVariablesService = createDecorator<IInlineCSChatVariablesService>('IInlineCSChatVariablesService');

export interface IInlineCSChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: ICSChatVariableData, resolver: IInlineChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariables(): Iterable<Readonly<ICSChatVariableData>>;
	getDynamicReferences(sessionId: string): ReadonlyArray<IDynamicReference>; // should be its own service?

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, token: CancellationToken): Promise<IChatVariableResolveResult>;
}

export interface IChatVariableResolveResult {
	variables: Record<string, ICSChatRequestVariableValue[]>;
	prompt: string;
}

export interface IDynamicReference {
	range: IRange;
	// data: any; // File details for a file, something else for a different type of thing, is it typed?
	data: Location;
}
