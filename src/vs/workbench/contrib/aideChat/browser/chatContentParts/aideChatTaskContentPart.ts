/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/aideChat/browser/chatContentParts/aideChatContentParts';
import { ChatProgressContentPart } from 'vs/workbench/contrib/aideChat/browser/chatContentParts/aideChatProgressContentPart';
import { ChatReferencesContentPart, ContentReferencesListPool } from 'vs/workbench/contrib/aideChat/browser/chatContentParts/aideChatReferencesContentPart';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatTask } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { IChatResponseViewModel } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';

export class ChatTaskContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	public readonly onDidChangeHeight: Event<void>;

	constructor(
		private readonly task: IAideChatTask,
		contentReferencesListPool: ContentReferencesListPool,
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (task.progress.length) {
			const refsPart = this._register(instantiationService.createInstance(ChatReferencesContentPart, task.progress, task.content.value, context.element as IChatResponseViewModel, contentReferencesListPool));
			this.domNode = dom.$('.chat-progress-task');
			this.domNode.appendChild(refsPart.domNode);
			this.onDidChangeHeight = refsPart.onDidChangeHeight;
		} else {
			const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, task, renderer, context, !task.isSettled(), true));
			this.domNode = progressPart.domNode;
			this.onDidChangeHeight = Event.None;
		}
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'progressTask'
			&& other.progress.length === this.task.progress.length
			&& other.isSettled() === this.task.isSettled();
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
