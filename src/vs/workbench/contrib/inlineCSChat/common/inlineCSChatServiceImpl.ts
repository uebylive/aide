/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { LinkedList } from 'vs/base/common/linkedList';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInlineCSChatService, IInlineCSChatSessionProvider, CTX_INLINE_CHAT_HAS_PROVIDER } from './inlineCSChat';

export class InlineCSChatServiceImpl implements IInlineCSChatService {

	declare _serviceBrand: undefined;

	private readonly _entries = new LinkedList<IInlineCSChatSessionProvider>();

	private readonly _ctxHasProvider: IContextKey<boolean>;

	private readonly _onDidChangeProviders = new Emitter<void>();
	public get onDidChangeProviders() {
		return this._onDidChangeProviders.event;
	}

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this._ctxHasProvider = CTX_INLINE_CHAT_HAS_PROVIDER.bindTo(contextKeyService);
	}

	addProvider(provider: IInlineCSChatSessionProvider): IDisposable {

		const rm = this._entries.push(provider);
		this._ctxHasProvider.set(true);
		this._onDidChangeProviders.fire();

		return toDisposable(() => {
			rm();
			this._ctxHasProvider.set(this._entries.size > 0);
			this._onDidChangeProviders.fire();
		});
	}

	getAllProvider() {
		return [...this._entries].reverse();
	}
}
