/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { ExtHostAideChatVariablesShape, ExtHostContext, IChatVariableResolverProgressDto, MainContext, MainThreadAideChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import { IAideChatRequestVariableValue, IAideChatVariableData, IAideChatVariableResolverProgress, IAideChatVariablesService } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadAideChatVariables)
export class MainThreadAideChatVariables implements MainThreadAideChatVariablesShape {

	private readonly _proxy: ExtHostAideChatVariablesShape;
	private readonly _variables = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<string, (part: IAideChatVariableResolverProgress) => void>();

	constructor(
		extHostContext: IExtHostContext,
		@IAideChatVariablesService private readonly _chatVariablesService: IAideChatVariablesService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatVariables);
	}

	dispose(): void {
		this._variables.clearAndDisposeAll();
	}

	$registerVariable(handle: number, data: IAideChatVariableData): void {
		const registration = this._chatVariablesService.registerVariable(data, async (messageText, _arg, model, progress, token) => {
			const varRequestId = `${model.sessionId}-${handle}`;
			this._pendingProgress.set(varRequestId, progress);
			const result = revive<IAideChatRequestVariableValue>(await this._proxy.$resolveVariable(handle, varRequestId, messageText, token));

			this._pendingProgress.delete(varRequestId);
			return result as any; // 'revive' type signature doesn't like this type for some reason
		});
		this._variables.set(handle, registration);
	}

	async $handleProgressChunk(requestId: string, progress: IChatVariableResolverProgressDto): Promise<number | void> {
		const revivedProgress = revive(progress);
		this._pendingProgress.get(requestId)?.(revivedProgress as IAideChatVariableResolverProgress);
	}

	$unregisterVariable(handle: number): void {
		this._variables.deleteAndDispose(handle);
	}
}
