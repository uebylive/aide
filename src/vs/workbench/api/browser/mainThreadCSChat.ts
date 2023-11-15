/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EndOfLineSequence } from 'vs/editor/common/model';
import { IProgress } from 'vs/platform/progress/common/progress';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { reviveWorkspaceEditDto } from 'vs/workbench/api/browser/mainThreadBulkEdits';
import { ExtHostCSChatShape, ExtHostContext, IChatRequestDto, IChatResponseProgressDto, ILocationDto, MainContext, MainThreadCSChatShape } from 'vs/workbench/api/common/extHost.protocol';
import { ICSChatWidgetService } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ICSChatContributionService } from 'vs/workbench/contrib/csChat/common/csChatContributionService';
import { isCompleteInteractiveProgressTreeData } from 'vs/workbench/contrib/csChat/common/csChatModel';
import { IChat, IChatDynamicRequest, IChatProgress, IChatResponse, IChatResponseProgressFileTreeData, ICSChatService } from 'vs/workbench/contrib/csChat/common/csChatService';
import { ICSChatBulkEditResponse, ICSChatEditProgressItem, ICSChatEditResponse } from 'vs/workbench/contrib/inlineCSChat/common/inlineCSChat';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadCSChat)
export class MainThreadCSChat extends Disposable implements MainThreadCSChatShape {

	private readonly _providerRegistrations = this._register(new DisposableMap<number>());
	private readonly _activeRequestProgressCallbacks = new Map<string, (progress: IChatProgress) => (DeferredPromise<string | IMarkdownString> | void)>();
	private readonly _stateEmitters = new Map<number, Emitter<any>>();

	private readonly _proxy: ExtHostCSChatShape;

	private _responsePartHandlePool = 0;
	private readonly _activeResponsePartPromises = new Map<string, DeferredPromise<string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData }>>();

	private readonly _activeEditProgresses = new Map<string, IProgress<ICSChatEditProgressItem>>();

	constructor(
		extHostContext: IExtHostContext,
		@ICSChatService private readonly _chatService: ICSChatService,
		@ICSChatWidgetService private readonly _chatWidgetService: ICSChatWidgetService,
		@ICSChatContributionService private readonly chatContribService: ICSChatContributionService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCSChat);

		this._register(this._chatService.onDidPerformUserAction(e => {
			if (!e.agentId) {
				this._proxy.$onDidPerformUserAction(e);
			}
		}));
	}

	$transferChatSession(sessionId: number, toWorkspace: UriComponents): void {
		const sessionIdStr = this._chatService.getSessionId(sessionId);
		if (!sessionIdStr) {
			throw new Error(`Failed to transfer session. Unknown session provider ID: ${sessionId}`);
		}

		const widget = this._chatWidgetService.getWidgetBySessionId(sessionIdStr);
		const inputValue = widget?.inputEditor.getValue() ?? '';
		this._chatService.transferChatSession({ sessionId: sessionIdStr, inputValue: inputValue }, URI.revive(toWorkspace));
	}

	async $registerChatProvider(handle: number, id: string): Promise<void> {
		const registration = this.chatContribService.registeredProviders.find(staticProvider => staticProvider.id === id);
		if (!registration) {
			throw new Error(`Provider ${id} must be declared in the package.json.`);
		}

		const unreg = this._chatService.registerProvider({
			id,
			displayName: registration.label,
			prepareSession: async (initialState, token) => {
				const session = await this._proxy.$prepareChat(handle, initialState, token);
				if (!session) {
					return undefined;
				}

				const responderAvatarIconUri = session.responderAvatarIconUri &&
					URI.revive(session.responderAvatarIconUri);

				const emitter = new Emitter<any>();
				this._stateEmitters.set(session.id, emitter);
				return <IChat>{
					id: session.id,
					requesterUsername: session.requesterUsername,
					requesterAvatarIconUri: URI.revive(session.requesterAvatarIconUri),
					responderUsername: session.responderUsername,
					responderAvatarIconUri,
					inputPlaceholder: session.inputPlaceholder,
					onDidChangeState: emitter.event,
					dispose: () => {
						emitter.dispose();
						this._stateEmitters.delete(session.id);
						this._proxy.$releaseSession(session.id);
					}
				};
			},
			provideReply: async (request, progress, token) => {
				const id = `${handle}_${request.session.id}`;
				this._activeRequestProgressCallbacks.set(id, progress);
				try {
					const requestDto: IChatRequestDto = {
						message: request.message,
						variables: request.variables
					};
					const dto = await this._proxy.$provideReply(handle, request.session.id, requestDto, token);
					return <IChatResponse>{
						session: request.session,
						...dto
					};
				} finally {
					this._activeRequestProgressCallbacks.delete(id);
				}
			},
			provideWelcomeMessage: (token) => {
				return this._proxy.$provideWelcomeMessage(handle, token);
			},
			provideSampleQuestions: (token) => {
				return this._proxy.$provideSampleQuestions(handle, token);
			},
			provideSlashCommands: (session, token) => {
				return this._proxy.$provideSlashCommands(handle, session.id, token);
			},
			provideFollowups: (session, token) => {
				return this._proxy.$provideFollowups(handle, session.id, token);
			},
			provideEdits: async (session, requestId, progress, token) => {
				this._activeEditProgresses.set(requestId, progress);
				try {
					const result = await this._proxy.$provideEdits(handle, session.id, requestId, token);
					if (result?.type === 'bulkEdit') {
						(<ICSChatBulkEditResponse>result).edits = reviveWorkspaceEditDto(result.edits, this._uriIdentService);
					}
					return <ICSChatEditResponse | undefined>result;
				} finally {
					this._activeEditProgresses.delete(requestId);
				}
			},
			removeRequest: (session, requestId) => {
				return this._proxy.$removeRequest(handle, session.id, requestId);
			}
		});

		this._providerRegistrations.set(handle, unreg);
	}

	async $acceptResponseProgress(handle: number, sessionId: number, progress: IChatResponseProgressDto, responsePartHandle?: number): Promise<number | void> {
		const id = `${handle}_${sessionId}`;

		if ('placeholder' in progress) {
			const responsePartId = `${id}_${++this._responsePartHandlePool}`;
			const deferredContentPromise = new DeferredPromise<string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData }>();
			this._activeResponsePartPromises.set(responsePartId, deferredContentPromise);
			this._activeRequestProgressCallbacks.get(id)?.({ ...progress, resolvedContent: deferredContentPromise.p });
			return this._responsePartHandlePool;
		} else if (responsePartHandle) {
			// Complete an existing deferred promise with resolved content
			const responsePartId = `${id}_${responsePartHandle}`;
			const deferredContentPromise = this._activeResponsePartPromises.get(responsePartId);
			if (deferredContentPromise && isCompleteInteractiveProgressTreeData(progress)) {
				const withRevivedUris = revive<{ treeData: IChatResponseProgressFileTreeData }>(progress);
				deferredContentPromise.complete(withRevivedUris);
				this._activeResponsePartPromises.delete(responsePartId);
			} else if (deferredContentPromise && 'content' in progress) {
				deferredContentPromise.complete(progress.content);
				this._activeResponsePartPromises.delete(responsePartId);
			}
			return;
		}

		// No need to support standalone tree data that's not attached to a placeholder in API
		if (isCompleteInteractiveProgressTreeData(progress)) {
			return;
		}

		// TS won't let us change the type of `progress`
		let revivedProgress: IChatProgress;
		if ('documents' in progress) {
			revivedProgress = { documents: revive(progress.documents) };
		} else if ('reference' in progress) {
			revivedProgress = revive<{ reference: UriComponents | ILocationDto }>(progress);
		} else if ('inlineReference' in progress) {
			revivedProgress = revive<{ inlineReference: UriComponents | ILocationDto; name?: string }>(progress);
		} else {
			revivedProgress = progress;
		}

		this._activeRequestProgressCallbacks.get(id)?.(revivedProgress);
	}

	async $acceptChatState(sessionId: number, state: any): Promise<void> {
		this._stateEmitters.get(sessionId)?.fire(state);
	}

	async $sendRequestToProvider(providerId: string, message: IChatDynamicRequest): Promise<void> {
		const widget = await this._chatWidgetService.revealViewForProvider(providerId);
		if (widget && widget.viewModel) {
			this._chatService.sendRequestToProvider(widget.viewModel.sessionId, message);
		}
	}

	async $handleProgressChunk(requestId: string, chunk: { markdownFragment?: string | undefined; edits?: { range: { readonly startLineNumber: number; readonly startColumn: number; readonly endLineNumber: number; readonly endColumn: number }; text: string; eol?: EndOfLineSequence | undefined }[] | undefined; editsShouldBeInstant?: boolean | undefined; message?: string | undefined; slashCommand?: string | undefined }): Promise<void> {
		await Promise.resolve(this._activeEditProgresses.get(requestId)?.report(chunk));
	}

	async $unregisterChatProvider(handle: number): Promise<void> {
		this._providerRegistrations.deleteAndDispose(handle);
	}
}
