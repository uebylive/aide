/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ChatAgentLocation, IAideAgentAgentService } from '../common/aideAgentAgents.js';
import { ChatModelInitState, IChatModel } from '../common/aideAgentModel.js';
import { CHAT_PROVIDER_ID } from '../common/aideAgentParticipantContribTypes.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { IChatViewTitleActionContext } from './actions/aideAgentActions.js';
import { ChatWidget, IChatViewState } from './aideAgentWidget.js';

interface IViewPaneState extends IChatViewState {
	sessionId?: string;
}

class ModeSwitcher extends Disposable {
	private _onChange = this._register(new Emitter<{ id: string | null; focus: boolean }>());
	get onChange(): Event<{ id: string | null; focus: boolean }> { return this._onChange.event; }

	private _currentId: string | null = null;
	get currentId(): string | null { return this._currentId; }

	private actions: Action[];
	private actionbar: ActionBar;

	constructor(container: HTMLElement) {
		super();
		const element = append(container, $('.mode-switcher'));
		this.actions = [];
		this.actionbar = this._register(new ActionBar(element));
	}

	push(id: string, label: string, tooltip: string): void {
		const action = new Action(id, label, undefined, true, () => this.update(id, true));

		action.tooltip = tooltip;

		this.actions.push(action);
		this.actionbar.push(action);

		if (this.actions.length === 1) {
			this.update(id);
		}
	}

	private update(id: string, focus?: boolean): void {
		this._currentId = id;
		this._onChange.fire({ id, focus: !!focus });
		this.actions.forEach(a => a.checked = a.id === id);
	}
}

export const CHAT_SIDEBAR_PANEL_ID = 'workbench.panel.aideAgentSidebar';
export class ChatViewPane extends ViewPane {
	private modeSwitcher!: ModeSwitcher;

	private _widget!: ChatWidget;
	get widget(): ChatWidget { return this._widget; }

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;
	private didProviderRegistrationFail = false;
	private didUnregisterProvider = false;

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
		@IAideAgentService private readonly chatService: IAideAgentService,
		@IAideAgentAgentService private readonly chatAgentService: IAideAgentAgentService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		this.memento = new Memento('aide-agent-session-view-' + CHAT_PROVIDER_ID, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)) {
				if (!this._widget?.viewModel) {
					const sessionId = this.getSessionId();
					const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

					// The widget may be hidden at this point, because welcome views were allowed. Use setVisible to
					// avoid doing a render while the widget is hidden. This is changing the condition in `shouldShowWelcome`
					// so it should fire onDidChangeViewWelcomeState.
					try {
						this._widget.setVisible(false);
						this.updateModel(model);
						this.didProviderRegistrationFail = false;
						this.didUnregisterProvider = false;
						this._onDidChangeViewWelcomeState.fire();
					} finally {
						this.widget.setVisible(true);
					}
				}
			} else if (this._widget?.viewModel?.initState === ChatModelInitState.Initialized) {
				// Model is initialized, and the default agent disappeared, so show welcome view
				this.didUnregisterProvider = true;
			}

			this._onDidChangeViewWelcomeState.fire();
		}));
	}

	override getActionsContext(): IChatViewTitleActionContext {
		return {
			chatView: this
		};
	}

	private updateModel(model?: IChatModel | undefined): void {
		this.modelDisposables.clear();

		model = model ?? (this.chatService.transferredSessionData?.sessionId
			? this.chatService.getOrRestoreSession(this.chatService.transferredSessionData.sessionId)
			: this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None));
		if (!model) {
			throw new Error('Could not start chat session');
		}

		this._widget.setModel(model, { ...this.viewState });
		this.viewState.sessionId = model.sessionId;
	}

	override shouldShowWelcome(): boolean {
		if (!this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Panel)) {
			return true;
		}

		const noPersistedSessions = !this.chatService.hasSessions();
		return this.didUnregisterProvider || !this._widget?.viewModel && (noPersistedSessions || this.didProviderRegistrationFail);
	}

	private getSessionId() {
		let sessionId: string | undefined;
		if (this.chatService.transferredSessionData) {
			sessionId = this.chatService.transferredSessionData.sessionId;
			this.viewState.inputValue = this.chatService.transferredSessionData.inputValue;
		} else {
			sessionId = this.viewState.sessionId;
		}
		return sessionId;
	}

	protected override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);

			this.modeSwitcher = this._register(new ModeSwitcher(parent));
			this.modeSwitcher.push('edit', 'Edit', 'Edit code using the agent');
			this.modeSwitcher.push('chat', 'Chat', 'Chat with the agent');
			this.modeSwitcher.onChange(e => {
				console.log('modeSwitcher.onChange', e);
			});

			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			const locationBasedColors = this.getLocationBasedColors();
			this._widget = this._register(scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Panel,
				{ viewId: this.id },
				{ supportsFileReferences: true },
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: locationBasedColors.background,
					overlayBackground: locationBasedColors.overlayBackground,
					inputEditorBackground: locationBasedColors.background,
					resultEditorBackground: editorBackground
				}));
			this._register(this.onDidChangeBodyVisibility(visible => {
				this._widget.setVisible(visible);
			}));
			this._register(this._widget.onDidClear(() => this.clear()));
			this._widget.render(parent);

			const sessionId = this.getSessionId();
			// Render the welcome view if this session gets disposed at any point,
			// including if the provider registration fails
			const disposeListener = sessionId ? this._register(this.chatService.onDidDisposeSession((e) => {
				if (e.reason === 'initializationFailed') {
					this.didProviderRegistrationFail = true;
					disposeListener?.dispose();
					this._onDidChangeViewWelcomeState.fire();
				}
			})) : undefined;
			const model = sessionId ? this.chatService.getOrRestoreSession(sessionId) : undefined;

			this.updateModel(model);
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	acceptInput(query?: string): void {
		this._widget.acceptInput(query);
	}

	private clear(): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		// Grab the widget's latest view state because it will be loaded back into the widget
		this.updateViewState();
		this.updateModel(undefined);
	}

	loadSession(sessionId: string): void {
		if (this.widget.viewModel) {
			this.chatService.clearSession(this.widget.viewModel.sessionId);
		}

		const newModel = this.chatService.getOrRestoreSession(sessionId);
		this.updateModel(newModel);
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

	override saveState(): void {
		if (this._widget) {
			// Since input history is per-provider, this is handled by a separate service and not the memento here.
			// TODO multiple chat views will overwrite each other
			this._widget.saveState();

			this.updateViewState();
			this.memento.saveMemento();
		}

		super.saveState();
	}

	private updateViewState(): void {
		const widgetViewState = this._widget.getViewState();
		this.viewState.inputValue = widgetViewState.inputValue;
		this.viewState.inputState = widgetViewState.inputState;
	}
}
