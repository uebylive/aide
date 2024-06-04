/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatModel, IChatRequestVariableData, IAideChatRequestVariableEntry } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/aideChat/common/aideChatParserTypes';
import { IAideChatContentReference, IAideChatProgressMessage } from 'vs/workbench/contrib/aideChat/common/aideChatService';

export interface IAideChatVariableData {
	id: string;
	name: string;
	icon?: ThemeIcon;
	fullName?: string;
	description: string;
	modelDescription?: string;
	isSlow?: boolean;
	hidden?: boolean;
	canTakeArgument?: boolean;
}

export type IAideChatRequestVariableValue = string | URI | Location | unknown;

export type IAideChatVariableResolverProgress =
	| IAideChatContentReference
	| IAideChatProgressMessage;

export interface IChatVariableResolver {
	(messageText: string, arg: string | undefined, model: IChatModel, progress: (part: IAideChatVariableResolverProgress) => void, token: CancellationToken): Promise<IAideChatRequestVariableValue | undefined>;
}

export const IAideChatVariablesService = createDecorator<IAideChatVariablesService>('IAideChatVariablesService');

export interface IAideChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IAideChatVariableData, resolver: IChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariable(name: string): IAideChatVariableData | undefined;
	getVariables(): Iterable<Readonly<IAideChatVariableData>>;
	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable>; // should be its own service?

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, attachedContextVariables: IAideChatRequestVariableEntry[] | undefined, model: IChatModel, progress: (part: IAideChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData>;
	resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IAideChatVariableResolverProgress) => void, token: CancellationToken): Promise<IAideChatRequestVariableValue | undefined>;
}

export interface IDynamicVariable {
	range: IRange;
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	prefix?: string;
	modelDescription?: string;
	data: IAideChatRequestVariableValue;
}
