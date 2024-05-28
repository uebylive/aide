/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colors/editorColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { Memento } from 'vs/workbench/common/memento';
import { SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { AideChatWidget, IAideChatViewState } from 'vs/workbench/contrib/aideChat/browser/aideChatWidget';
import { IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';

interface IViewPaneState extends IAideChatViewState {
	sessionId?: string;
}

export const AIDE_CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.aideChatSidebar';

export class AideChatViewPane extends ViewPane {
	private _widget!: AideChatWidget;
	get widget(): AideChatWidget { return this._widget; }

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IAideChatService private readonly chatService: IAideChatService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.memento = new Memento('aide-chat-session-view', this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private updateModel(model?: IAideChatModel | undefined, viewState?: IViewPaneState): void {
		this.modelDisposables.clear();

		model = model ?? this.chatService.startSession(CancellationToken.None);
		if (!model) {
			throw new Error('Could not start Aide chat session');
		}

		this._widget.setModel(model, { ...(viewState ?? this.viewState) });
		this.viewState.sessionId = model.sessionId;
	}

	private getSessionId() {
		return this.viewState.sessionId;
	}

	protected override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);

			const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
			const locationBasedColors = this.getLocationBasedColors();
			this._widget = this._register(scopedInstantiationService.createInstance(
				AideChatWidget,
				{},
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: locationBasedColors.background,
					inputEditorBackground: locationBasedColors.background,
					resultEditorBackground: editorBackground
				}
			));
			this._register(this.onDidChangeBodyVisibility(visible => {
				if (visible) {
					this._widget.setVisible(visible);
				}
			}));
			this._widget.render(parent);

			const sessionId = this.getSessionId();
			const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

			this.updateModel(model);
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	override focus(): void {
		super.focus();
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget.layout(height, width);
	}
}
