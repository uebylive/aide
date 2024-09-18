/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatWidget } from '../../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { ChatWidget, IChatWidgetContrib } from '../../../../../workbench/contrib/aideChat/browser/aideChatWidget.js';
import { IAideChatRequestVariableEntry } from '../../../../../workbench/contrib/aideChat/common/aideChatModel.js';

export class ChatContextAttachments extends Disposable implements IChatWidgetContrib {

	private _attachedContext = new Set<IAideChatRequestVariableEntry>();

	private readonly _onDidChangeInputState = this._register(new Emitter<void>());
	readonly onDidChangeInputState = this._onDidChangeInputState.event;

	public static readonly ID = 'chatContextAttachments';

	get id() {
		return ChatContextAttachments.ID;
	}

	constructor(readonly widget: IChatWidget) {
		super();

		this._register(this.widget.onDidDeleteContext((e) => {
			this._removeContext(e);
		}));

		this._register(this.widget.onDidSubmitAgent(() => {
			this._clearAttachedContext();
		}));
	}

	getInputState(): IAideChatRequestVariableEntry[] {
		return [...this._attachedContext.values()];
	}

	setInputState(s: any): void {
		if (!Array.isArray(s)) {
			s = [];
		}

		this._attachedContext.clear();
		for (const attachment of s) {
			this._attachedContext.add(attachment);
		}

		this.widget.setContext(true, ...s);
	}

	getContext() {
		return new Set([...this._attachedContext.values()].map((v) => v.id));
	}

	setContext(overwrite: boolean, ...attachments: IAideChatRequestVariableEntry[]) {
		if (overwrite) {
			this._attachedContext.clear();
		}
		for (const attachment of attachments) {
			this._attachedContext.add(attachment);
		}

		this.widget.setContext(overwrite, ...attachments);
		this._onDidChangeInputState.fire();
	}

	private _removeContext(attachment: IAideChatRequestVariableEntry) {
		this._attachedContext.delete(attachment);
		this._onDidChangeInputState.fire();
	}

	private _clearAttachedContext() {
		this._attachedContext.clear();
	}
}

ChatWidget.CONTRIBS.push(ChatContextAttachments);
