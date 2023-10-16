/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/arc';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { inputBackground, quickInputBackground, quickInputForeground } from 'vs/platform/theme/common/colorRegistry';
import { IArcWidget, IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { ARC_VIEW_VISIBLE } from 'vs/workbench/contrib/arc/common/arcContextKeys';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IArcViewModel } from 'vs/workbench/contrib/arc/common/arcViewModel';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export class ArcWidgetService extends Disposable implements IArcWidgetService {
	declare readonly _serviceBrand: undefined;

	private _hidden: boolean = true;
	private _widget: ArcWidget | undefined;
	private _container: HTMLElement | undefined;
	private _chatContainer: HTMLElement | undefined;

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	show() {
		if (!this._widget) {
			const arcContainer = document.createElement('div');
			arcContainer.classList.add('arc-widget-container');
			this._container = arcContainer;
			const chatContainer = document.createElement('div');
			chatContainer.classList.add('arc-widget-chat-container');
			this._container.appendChild(chatContainer);
			this._chatContainer = chatContainer;
			this._widget = this.instantiationService.createInstance(ArcWidget, 'cs-arc');
			this._widget.render(this._chatContainer);
			this.workbenchLayoutService.container.appendChild(this._container);
		} else if (this._container) {
			this._container.style.display = 'block';
		}
		this._hidden = false;
	}

	hide(): void {
		this._hidden = true;
		if (this._container) {
			this._container.style.display = 'none';
		}
	}

	toggle(): void {
		if (!this._hidden) {
			this.hide();
		} else {
			this.show();
		}
	}
}

export class ArcWidget extends Disposable implements IArcWidget {
	declare readonly _serviceBrand: undefined;

	public static readonly CONTRIBS: { new(...args: [IArcWidget, ...any]): any }[] = [];

	private chatWidget: ChatWidget | undefined;
	private model: ChatModel | undefined;
	private _currentQuery: string | undefined;

	private _viewModel: IArcViewModel | undefined;
	private set viewModel(viewModel: IArcViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this._viewModel = viewModel;
	}

	get viewModel() {
		return this._viewModel;
	}

	constructor(
		private readonly providerId: string,
		@IArcService private readonly arcService: IArcService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
	}

	private clear(): void {
		this.model?.dispose();
		this.model = undefined;
		this.updateModel();
		this.chatWidget?.inputEditor.setValue('');
	}

	render(parent: HTMLElement): void {
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		ARC_VIEW_VISIBLE.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, inputScopedContextKeyService])
		);

		if (this.chatWidget) {
			throw new Error('Cannot render chat twice');
		}

		this.chatWidget = scopedInstantiationService.createInstance(
			ChatWidget,
			{ resource: true },
			{ supportsFileReferences: true },
			{
				listForeground: quickInputForeground,
				listBackground: quickInputBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: quickInputBackground
			}
		);
		this._register(this.chatWidget.onDidClear(() => this.clear()));
		this.chatWidget.render(parent);
		this.chatWidget.setVisible(true);
		this.chatWidget.layout(1000, 1000);
		this.updateModel();

		this._register(this.chatWidget.inputEditor.onDidChangeModelContent((e) => {
			this._currentQuery = this.chatWidget?.inputEditor.getValue();
		}));
	}

	private updateModel(): void {
		this.arcService.startSession(this.providerId, CancellationToken.None);

		this.model = this.chatService.startSession('cs-chat', CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}
		this.chatWidget?.setModel(this.model, { inputValue: this._currentQuery });
	}
}
