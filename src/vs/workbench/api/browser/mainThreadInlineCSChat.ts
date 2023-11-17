/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from 'vs/base/common/lifecycle';
import { IInlineCSChatBulkEditResponse, IInlineCSChatProgressItem, ICSChatEditResponse, IInlineCSChatService } from 'vs/workbench/contrib/inlineCSChat/common/inlineCSChat';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { reviveWorkspaceEditDto } from 'vs/workbench/api/browser/mainThreadBulkEdits';
import { ExtHostContext, ExtHostInlineCSChatShape, MainContext, MainThreadInlineCSChatShape, } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IProgress } from 'vs/platform/progress/common/progress';

@extHostNamedCustomer(MainContext.MainThreadInlineCSChat)
export class MainThreadInlineCSChat implements MainThreadInlineCSChatShape {

	private readonly _registrations = new DisposableMap<number>();
	private readonly _proxy: ExtHostInlineCSChatShape;

	private readonly _progresses = new Map<string, IProgress<IInlineCSChatProgressItem>>();

	constructor(
		extHostContext: IExtHostContext,
		@IInlineCSChatService private readonly _inlineChatService: IInlineCSChatService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostInlineCSChat);
	}

	dispose(): void {
		this._registrations.dispose();
	}

	async $registerCSChatEditorProvider(handle: number, label: string, debugName: string, supportsFeedback: boolean): Promise<void> {
		const unreg = this._inlineChatService.addProvider({
			debugName,
			label,
			prepareInlineChatSession: async (model, range, token) => {
				const session = await this._proxy.$prepareSession(handle, model.uri, range, token);
				if (!session) {
					return undefined;
				}
				return {
					...session,
					dispose: () => {
						this._proxy.$releaseSession(handle, session.id);
					}
				};
			},
			provideResponse: async (item, request, progress, token) => {
				this._progresses.set(request.requestId, progress);
				try {
					const result = await this._proxy.$provideResponse(handle, item, request, token);
					if (result?.type === 'bulkEdit') {
						(<IInlineCSChatBulkEditResponse>result).edits = reviveWorkspaceEditDto(result.edits, this._uriIdentService);
					}
					return <ICSChatEditResponse | undefined>result;
				} finally {
					this._progresses.delete(request.requestId);
				}
			},
			handleInlineChatResponseFeedback: !supportsFeedback ? undefined : async (session, response, kind) => {
				this._proxy.$handleFeedback(handle, session.id, response.id, kind);
			}
		});

		this._registrations.set(handle, unreg);
	}

	async $handleProgressChunk(requestId: string, chunk: IInlineCSChatProgressItem): Promise<void> {
		await Promise.resolve(this._progresses.get(requestId)?.report(chunk));
	}

	async $unregisterCSChatEditorProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
