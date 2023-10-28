/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./media/chat';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { inputBackground, quickInputBackground, quickInputForeground } from 'vs/platform/theme/common/colorRegistry';
import { IChatWidgetService, IHoverChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

export class HoverChatService extends Disposable implements IHoverChatService {
	readonly _serviceBrand: undefined;

	private _currentChat: HoverChat | undefined;
	private _container: HTMLElement | undefined;

	private _isHidden: boolean = false;

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.workbenchLayoutService.onDidChangePartVisibility(() => {
			const isAuxiliaryBarVisible = this.workbenchLayoutService.isVisible(Parts.AUXILIARYBAR_PART);
			if (isAuxiliaryBarVisible) {
				this.close();
			} else if (!this._isHidden) {
				// We are hardcoding the cs-chat over here, might want to change
				// it later on
				// TODO(codestory): Make this more configurable later on
				this.open('cs-chat');
			}
		}));
	}

	get enabled(): boolean {
		return this.chatService.getProviderInfos().length > 0;
	}

	open(providerId?: string): void {
		this._isHidden = false;

		// Check if any providers are available. If not, show nothing
		// This shouldn't be needed because of the precondition, but just in case
		const providerInfo = providerId
			? this.chatService.getProviderInfos().find(info => info.id === providerId)
			: this.chatService.getProviderInfos()[0];
		if (!providerInfo) {
			return;
		}

		const isAuxiliaryBarVisible = this.workbenchLayoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (isAuxiliaryBarVisible) {
			return;
		}

		if (!this._container) {
			const hoverChatContainer = document.createElement('div');
			hoverChatContainer.classList.add('hover-chat-container');
			this._container = document.createElement('div');
			this._container.classList.add('hover-chat-input-container');
			hoverChatContainer.appendChild(this._container);
			const hint = document.createElement('p');
			hint.classList.add('hover-chat-hint');
			hint.innerText = 'Press shift twice to focus';
			this._container.appendChild(hint);
			this.workbenchLayoutService.container.appendChild(hoverChatContainer);
		}

		if (!this._currentChat) {
			this._currentChat = this.instantiationService.createInstance(HoverChat, {
				providerId: providerInfo.id,
			});
			this._register(this._currentChat.onDidAcceptInput(() => this.close()));
			this._register(this._currentChat.onFocusInput(() => {
				const hint = this._container?.querySelector('.hover-chat-hint') as HTMLElement;
				if (hint) {
					hint.style.display = 'none';
				}
			}));
			this._register(this._currentChat.onBlurInput(() => {
				const hint = this._container?.querySelector('.hover-chat-hint') as HTMLElement;
				if (hint) {
					hint.style.display = 'block';
				}
			}));
			this._currentChat.render(this._container);
		}

		this.focus();
	}

	private focus(): void {
		this._currentChat?.focus();
	}

	private close(): void {
		this._currentChat?.dispose();
		this._currentChat = undefined;
		this._container?.remove();
		this._container = undefined;
	}

	toggle(providerId?: string): void {
		if (this._currentChat) {
			this.close();
			this._isHidden = true;
		} else {
			this.open(providerId);
			this._isHidden = false;
		}
	}
}

class HoverChat extends Disposable {
	static DEFAULT_MIN_HEIGHT = 200;

	private widget!: ChatWidget;
	private model: ChatModel | undefined;
	private _currentQuery: string | undefined;

	private readonly _onDidAcceptInput = this._register(new Emitter<void>());
	readonly onDidAcceptInput = this._onDidAcceptInput.event;
	private readonly _onFocusInput = this._register(new Emitter<void>());
	readonly onFocusInput = this._onFocusInput.event;
	private readonly _onBlurInput = this._register(new Emitter<void>());
	readonly onBlurInput = this._onBlurInput.event;

	constructor(
		private readonly _options: IChatViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
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
			{ renderOnlyInput: true, supportsFileReferences: true },
			{
				listForeground: quickInputForeground,
				listBackground: quickInputBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: quickInputBackground
			}
		);
		this._register(this.widget.onDidAcceptInput((input) => this.openChatView(input)));
		this._register(this.widget.onDidFocus(() => this._onFocusInput.fire()));
		this._register(this.widget.onDidBlur(() => this._onBlurInput.fire()));
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

	async openChatView(input: void | string): Promise<void> {
		if (!input) {
			return;
		}

		const widget = await this._chatWidgetService.revealViewForProvider(this._options.providerId);
		if (!widget?.viewModel || !this.model) {
			return;
		}

		widget.focusInput();
		widget.acceptInput(input);
		this._onDidAcceptInput.fire();
	}
}
