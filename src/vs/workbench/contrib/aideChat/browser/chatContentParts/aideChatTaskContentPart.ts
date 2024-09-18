/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../../../../../workbench/contrib/aideChat/browser/chatContentParts/aideChatContentParts.js';
import { ChatProgressContentPart } from '../../../../../workbench/contrib/aideChat/browser/chatContentParts/aideChatProgressContentPart.js';
import { ChatReferencesContentPart, ContentReferencesListPool } from '../../../../../workbench/contrib/aideChat/browser/chatContentParts/aideChatReferencesContentPart.js';
import { IChatProgressRenderableResponseContent } from '../../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { IAideChatTask } from '../../../../../workbench/contrib/aideChat/common/aideChatService.js';
import { IChatResponseViewModel } from '../../../../../workbench/contrib/aideChat/common/aideChatViewModel.js';

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
