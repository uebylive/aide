/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfirmationWidget } from '../../../../../workbench/contrib/aideChat/browser/chatContentParts/aideChatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../../../../../workbench/contrib/aideChat/browser/chatContentParts/aideChatContentParts.js';
import { IChatProgressRenderableResponseContent } from '../../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { IAideChatConfirmation, IChatSendRequestOptions, IAideChatService } from '../../../../../workbench/contrib/aideChat/common/aideChatService.js';
import { isResponseVM } from '../../../../../workbench/contrib/aideChat/common/aideChatViewModel.js';

export class ChatConfirmationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		confirmation: IAideChatConfirmation,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAideChatService private readonly chatService: IAideChatService,
	) {
		super();

		const element = context.element;
		const confirmationWidget = this._register(this.instantiationService.createInstance(ChatConfirmationWidget, confirmation.title, confirmation.message, [
			{ label: localize('accept', "Accept"), data: confirmation.data },
			{ label: localize('dismiss', "Dismiss"), data: confirmation.data, isSecondary: true },
		]));
		confirmationWidget.setShowButtons(!confirmation.isUsed);

		this._register(confirmationWidget.onDidClick(async e => {
			if (isResponseVM(element)) {
				const prompt = `${e.label}: "${confirmation.title}"`;
				const data: IChatSendRequestOptions = e.isSecondary ?
					{ rejectedConfirmationData: [e.data] } :
					{ acceptedConfirmationData: [e.data] };
				data.agentId = element.agent?.id;
				data.slashCommand = element.slashCommand?.name;
				if (await this.chatService.sendRequest(element.sessionId, prompt, data)) {
					confirmation.isUsed = true;
					confirmationWidget.setShowButtons(false);
					this._onDidChangeHeight.fire();
				}
			}
		}));

		this.domNode = confirmationWidget.domNode;
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'confirmation';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
