/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Location } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AideChatAgentLocation } from '../../../../workbench/contrib/aideChat/common/aideChatAgents.js';
import { IChatModel, IChatRequestVariableData, IAideChatRequestVariableEntry } from '../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { IParsedChatRequest } from '../../../../workbench/contrib/aideChat/common/aideChatParserTypes.js';
import { IAideChatContentReference, IAideChatProgressMessage } from '../../../../workbench/contrib/aideChat/common/aideChatService.js';

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
	attachContext(name: string, value: string | URI | Location | unknown, location: AideChatAgentLocation): void;

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
