/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/arc';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IArcWidget, IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IArcViewModel } from 'vs/workbench/contrib/arc/common/arcViewModel';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { quickInputForeground, quickInputBackground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ARC_VIEW_VISIBLE } from 'vs/workbench/contrib/arc/common/arcContextKeys';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

export class ArcWidgetService extends Disposable implements IArcWidgetService {
	declare readonly _serviceBrand: undefined;

	private _widget: ArcWidget | undefined;
	private _container: HTMLElement | undefined;
	private _chatContainer: HTMLElement | undefined;

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	private open() {
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
	}

	private close(): void {
		this._widget?.dispose();
		this._widget = undefined;
		this._container?.remove();
		this._container = undefined;
	}

	hide(): void {
		this.close();
	}

	toggle(): void {
		if (this._widget) {
			this.close();
		} else {
			this.open();
		}
	}
}

export class ArcWidget extends Disposable implements IArcWidget {
	declare readonly _serviceBrand: undefined;

	public static readonly CONTRIBS: { new(...args: [IArcWidget, ...any]): any }[] = [];

	private chatWidget: ChatWidget | undefined;
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
		const chatSession = this.chatService.startSession('cs-chat', CancellationToken.None);
		if (!chatSession) {
			throw new Error('Could not start chat session');
		}

		this.chatWidget?.setModel(chatSession, { inputValue: this._currentQuery });
	}
}
