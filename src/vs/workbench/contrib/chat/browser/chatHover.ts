/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./media/chat';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { inputBackground, quickInputBackground, quickInputForeground } from 'vs/platform/theme/common/colorRegistry';
import { IHoverChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export class HoverChatService extends Disposable implements IHoverChatService {
	readonly _serviceBrand: undefined;

	private _currentChat: HoverChat | undefined;
	private _container: HTMLElement | undefined;

	constructor(
		@ILayoutService layoutService: ILayoutService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._container = document.createElement('div');
		this._container.classList.add('hover-chat-container');
		layoutService.container.appendChild(this._container);
	}

	get enabled(): boolean {
		return this.chatService.getProviderInfos().length > 0;
	}

	open(providerId?: string): void {
		if (!this._container) {
			return;
		}

		// Check if any providers are available. If not, show nothing
		// This shouldn't be needed because of the precondition, but just in case
		const providerInfo = providerId
			? this.chatService.getProviderInfos().find(info => info.id === providerId)
			: this.chatService.getProviderInfos()[0];
		if (!providerInfo) {
			return;
		}

		if (!this._currentChat) {
			this._currentChat = this.instantiationService.createInstance(HoverChat, {
				providerId: providerInfo.id,
			});

			this._currentChat.render(this._container);
		}
	}

	focus(): void {
		this._currentChat?.focus();
	}

	openInChatView(): void {
		throw new Error('Method not implemented.');
	}
}

class HoverChat extends Disposable {
	static DEFAULT_MIN_HEIGHT = 200;

	private widget!: ChatWidget;
	private model: ChatModel | undefined;
	private _currentQuery: string | undefined;

	constructor(
		private readonly _options: IChatViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
	}

	render(parent: HTMLElement): void {
		if (this.widget) {
			throw new Error('Cannot render hover chat twice');
		}

		this.widget = this.instantiationService.createInstance(
			ChatWidget,
			{ resource: true },
			{
				listForeground: quickInputForeground,
				listBackground: quickInputBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: quickInputBackground
			}
		);
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.updateModel();
	}

	focus(): void {
		if (this.widget) {
			this.widget.focusInput();
			const value = this.widget.inputEditor.getValue();
			if (value) {
				this.widget.inputEditor.setSelection({
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: value.length + 1
				});
			}
		}
	}

	private updateModel(): void {
		this.model ??= this.chatService.startSession(this._options.providerId, CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}

		this.widget.setModel(this.model, { inputValue: this._currentQuery });
	}
}
