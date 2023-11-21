/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostCSChatVariablesShape, IMainContext, MainContext, MainThreadCSChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import { ICSChatRequestVariableValue, ICSChatVariableData } from 'vs/workbench/contrib/csChat/common/csChatVariables';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { ChatVariable } from 'vs/workbench/api/common/extHostTypeConverters';

export class ExtHostCSChatVariables implements ExtHostCSChatVariablesShape {

	private static _idPool = 0;

	private readonly _resolver = new Map<number, { extension: ExtensionIdentifier; data: ICSChatVariableData; resolver: vscode.ChatVariableResolver }>();
	private readonly _proxy: MainThreadCSChatVariablesShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatVariables);
	}

	async $resolveVariable(handle: number, messageText: string, token: CancellationToken): Promise<ICSChatRequestVariableValue[] | undefined> {
		const item = this._resolver.get(handle);
		if (!item) {
			return undefined;
		}
		try {
			const value = await item.resolver.resolve(item.data.name, { message: messageText }, token);
			if (value) {
				return value.map(ChatVariable.from);
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
		return undefined;
	}

	registerVariableResolver(extension: IExtensionDescription, name: string, description: string, resolver: vscode.ChatVariableResolver): IDisposable {
		const handle = ExtHostCSChatVariables._idPool++;
		this._resolver.set(handle, { extension: extension.identifier, data: { name, description }, resolver: resolver });
		this._proxy.$registerVariable(handle, { name, description });

		return toDisposable(() => {
			this._resolver.delete(handle);
			this._proxy.$unregisterVariable(handle);
		});
	}
}
