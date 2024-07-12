/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { CodeWindow, mainWindow } from 'vs/base/browser/window';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/commandPalette';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { ActionViewItemKb } from 'vs/platform/actionbarKeybinding/browser/actionViewItemKb';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_REQUEST_IN_PROGRESS, CONTEXT_PROBE_IS_ACTIVE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeSymbolInfo } from 'vs/workbench/contrib/aideProbe/browser/aideProbeSymbolInfo';
import { AideProbeViewModel, IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 24;

const COMMAND_PALETTE_POSITION_KEY = 'aide.commandPalette.widgetposition';
const COMMAND_PALETTE_Y_KEY = 'aide.commandPalette.widgety';


export class AideCommandPaletteWidget extends Disposable {


	private isVisible = false;
	private inputEditorHeight = 0;

	private isPanelVisible = false;

	private get yDefault() {
		return this.layoutService.mainContainerOffset.top;
	}

	readonly _container!: HTMLElement;

	private _inputContainer: HTMLElement; // contains all inputs
	private _inputEditorContainer: HTMLElement;
	private _inputEditor: CodeEditorWidget;

	private contextElement: HTMLElement;


	get inputEditor() {
		return this._inputEditor;
	}

	private inputModel: ITextModel | undefined;
	private inputEditorHasFocus: IContextKey<boolean>;
	private inputEditorHasText: IContextKey<boolean>;

	private requestInProgress: IContextKey<boolean>;
	private requestIsActive: IContextKey<boolean>;

	private _focusIndex: number | undefined;
	get focusIndex(): number | undefined {
		return this._focusIndex;
	}

	private symbolInfoListContainer: HTMLElement;
	private resourceLabels: ResourceLabels;
	private symbolInfoList: AideProbeSymbolInfo;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideProbeViewModel | undefined;
	private set viewModel(viewModel: AideProbeViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		} else {
			this.viewModel?.dispose();
			this.viewModelDisposables.clear();
		}
	}

	get viewModel(): AideProbeViewModel | undefined {
		return this._viewModel;
	}

	/** coordinate of the command palette per aux window */
	private readonly auxWindowCoordinates = new WeakMap<CodeWindow, { x: number; y: number | undefined }>();

	private static readonly INPUT_EDITOR_URI = URI.parse('aideCommandPalette:input');
	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	id: string = 'aideCommandPalette';

	constructor(
		readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IModelService private readonly modelService: IModelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
	) {
		super();

		this.inputEditorHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.requestInProgress = CONTEXT_PROBE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);
		this.requestIsActive = CONTEXT_PROBE_IS_ACTIVE.bindTo(contextKeyService);

		this._container = container;

		const innerContainer = dom.append(this.container, $('.command-palette-inner-container'));

		this.symbolInfoListContainer = dom.append(this.container, $('.command-palette-panel'));
		dom.hide(this.symbolInfoListContainer);

		this._inputContainer = dom.append(innerContainer, $('.command-palette-input'));

		// Context

		this.contextElement = dom.append(this._inputContainer, $('.command-palette-context'));
		dom.append(this.contextElement, $('.command-palette-logo'));

		const contextToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.contextElement, MenuId.AideCommandPaletteContext, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemKb, action);
				}
				return;
			}
		}));

		contextToolbar.getElement().classList.add('command-palette-context-toolbar');

		// Input editor
		this._inputEditorContainer = dom.append(this._inputContainer, $('.command-palette-input-editor'));
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(this._inputEditorContainer));
		const editorWrapper = dom.append(this._inputEditorContainer, $('.command-palette-input-editor-wrapper'));
		CONTEXT_IN_PROBE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const options: IEditorConstructionOptions = getSimpleEditorOptions(this.configurationService);
		options.readOnly = false;
		options.ariaLabel = this._getAriaLabel();
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 8 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		options.suggest = {
			showIcons: false,
			showSnippets: false,
			showWords: true,
			showStatusBar: false,
			insertMode: 'replace',
		};
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };


		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([HoverController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorWrapper, options, editorOptions));

		let inputModel = this.modelService.getModel(AideCommandPaletteWidget.INPUT_EDITOR_URI);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, AideCommandPaletteWidget.INPUT_EDITOR_URI, true);
			this._register(inputModel);
		}
		this.inputModel = inputModel;
		this._inputEditor.setModel(this.inputModel);
		this._inputEditor.render();

		this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
		this.symbolInfoList = this._register(this.instantiationService.createInstance(AideProbeSymbolInfo, this.resourceLabels, this.symbolInfoListContainer));

		// Submit toolbar

		const submitToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this._inputContainer, MenuId.AideCommandPaletteSubmit, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemWithKb, action);
				}
				return;
			}
		}));
		submitToolbar.getElement().classList.add('command-palette-submit-toolbar');

		// Register events

		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this.inputEditorHasFocus.set(true);
			this._onDidFocus.fire();
			this._inputEditorContainer.classList.toggle('focused', true);
		}));

		this._register(this._inputEditor.onDidBlurEditorText(() => {
			this.inputEditorHasFocus.set(false);
			this._inputEditorContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);

			if (this.requestIsActive.get() && this.viewModel) {
				this.viewModel.setFilter(this._inputEditor.getValue());
			}

			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this.setPanelPosition();
				this._onDidChangeHeight.fire();
				this.layout();
			}

			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this._inputEditorContainer.classList.toggle('has-text', inputHasText);
			this.inputEditorHasText.set(inputHasText);
		}));

		this._register(dom.addDisposableGenericMouseDownListener(this._container, (event: MouseEvent) => {
			if (dom.isHTMLElement(event.target) && (event.target === this._inputEditorContainer || this._inputEditorContainer.contains(event.target))) {
				return;
			}

			this._container.classList.add('dragged');
			const activeWindow = dom.getWindow(this.layoutService.activeContainer);

			const widgetRect = this._container.getBoundingClientRect();
			const mouseDownEvent = new StandardMouseEvent(activeWindow, event);
			const xInWidget = mouseDownEvent.posx - widgetRect.left;
			const yInWidget = mouseDownEvent.posy - widgetRect.top;

			const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(activeWindow, e);
				// Prevent default to stop editor selecting text
				mouseMoveEvent.preventDefault();

				this.setCoordinates(mouseMoveEvent.posx - xInWidget, mouseMoveEvent.posy - yInWidget);
			});

			const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e: MouseEvent) => {
				this.storePosition();
				this._container.classList.remove('dragged');

				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));


		const resizeListener = this._register(new MutableDisposable());
		const registerResizeListener = () => {
			resizeListener.value = this._register(dom.addDisposableListener(
				dom.getWindow(this.layoutService.activeContainer), dom.EventType.RESIZE, () => this.setCoordinates())
			);
		};
		registerResizeListener();

		this._register(this.symbolInfoList.onDidChangeFocus(e => {
			this._focusIndex = e.index;
		}));

		this.setCoordinates();
		this.layout();
	}


	setFocusIndex(index: number, browserEvent?: UIEvent) {
		this.symbolInfoList.setFocus(index, browserEvent);
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel ? localize('actions.commandPalette.accessibiltyHelp', "Command palette input, Type to interact with Aide, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('commandPalette.accessibilityHelpNoKb', "Command palette input, Type to interact with Aide, press enter to run. Use the Command Palette Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat Input");
	}

	focus() {
		this._inputEditor.focus();
	}

	hasFocus(): boolean {
		return this._inputEditor.hasWidgetFocus();
	}

	private setCoordinates(x?: number, y?: number): void {

		const widgetWidth = this._container.clientWidth;

		const currentWindow = dom.getWindow(this.layoutService.activeContainer);
		const isMainWindow = currentWindow === mainWindow;

		if (x === undefined) {
			const positionPercentage = isMainWindow
				? Number(this.storageService.get(COMMAND_PALETTE_POSITION_KEY, StorageScope.PROFILE))
				: this.auxWindowCoordinates.get(currentWindow)?.x;
			x = positionPercentage !== undefined && !isNaN(positionPercentage)
				? positionPercentage * currentWindow.innerWidth
				: (0.5 * currentWindow.innerWidth - 0.5 * widgetWidth);
		}
		x = clamp(x, 0, currentWindow.innerWidth - widgetWidth); // do not allow the widget to overflow on the right
		this._container.style.left = `${x}px`;

		if (y === undefined) {
			y = isMainWindow
				? this.storageService.getNumber(COMMAND_PALETTE_Y_KEY, StorageScope.PROFILE)
				: this.auxWindowCoordinates.get(currentWindow)?.y;
		}
		if (y === undefined) {
			y = this.yDefault;
		}

		this.setPanelPosition();

		const yMax = this.layoutService.activeContainer.clientHeight - this._container.clientHeight;
		y = Math.max(0, Math.min(y, yMax));
		this._container.style.top = `${y}px`;
	}

	private storePosition(): void {
		const activeWindow = dom.getWindow(this.layoutService.activeContainer);
		const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;

		const rect = this._container.getBoundingClientRect();
		const y = rect.top;
		const x = rect.left / activeWindow.innerWidth;
		if (isMainWindow) {
			this.storageService.store(COMMAND_PALETTE_POSITION_KEY, x, StorageScope.PROFILE, StorageTarget.MACHINE);
			this.storageService.store(COMMAND_PALETTE_Y_KEY, y, StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.auxWindowCoordinates.set(activeWindow, { x, y });
		}
	}

	private setPanelPosition() {
		if (this.isPanelVisible && this.symbolInfoList && this.symbolInfoList.contentHeight !== undefined) {
			const rect = this._container.getBoundingClientRect();
			if (rect.top < this.symbolInfoList.contentHeight) {
				this.symbolInfoListContainer.classList.add('top');
				this.symbolInfoListContainer.classList.remove('bottom');
			} else {
				this.symbolInfoListContainer.classList.add('bottom');
				this.symbolInfoListContainer.classList.remove('top');
			}
		}
	}

	show(): void {
		if (this.isVisible) {
			this.setCoordinates();
			return;
		}

		dom.show(this.container);
		this.isVisible = true;
		this.setCoordinates();
	}

	hide(): void {
		this.isVisible = false;
		dom.hide(this.container);
	}


	acceptInput() {
		return this._acceptInput();
	}

	private _acceptInput() {
		if (this.viewModel?.requestInProgress) {
			return;
		} else if (this.viewModel) {
			this.clear();
		}

		const model = this.aideProbeService.startSession();

		this.requestInProgress.set(true);
		this.requestIsActive.set(true);
		this.contextElement.classList.add('active');

		this.viewModel = this.instantiationService.createInstance(AideProbeViewModel, model);

		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(() => {
			this.onDidChangeItems();
		}));

		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidFilter, 0)(() => {
			this.onDidFilterItems();
		}));

		this.viewModelDisposables.add(this.viewModel.onChangeActiveBreakdown((breakdown) => {
			this.aideProbeService.navigateBreakdown();
			this.symbolInfoList.openSymbolInfoReference(breakdown);
		}));

		const editorValue = this._inputEditor.getValue();
		const result = this.aideProbeService.initiateProbe(this.viewModel.model, editorValue);
		this.inputEditor.setValue('');

		if (result) {
			this.onDidChangeItems();
			return result.responseCreatedPromise;
		}

		return editorValue;
	}

	private onDidChangeItems(): void {
		this.requestInProgress.set(this.viewModel?.requestInProgress ?? false);

		if ((this.viewModel?.breakdowns.length) ?? 0 > 0) {
			this.renderSymbolListData(this.viewModel?.breakdowns ?? []);
			dom.show(this.symbolInfoListContainer);
			this.isPanelVisible = true;
		} else {
			this.symbolInfoList.hide();
			dom.hide(this.symbolInfoListContainer);
			this.isPanelVisible = false;
		}


		this.layoutPanel();
		this.setPanelPosition();
	}


	private onDidFilterItems() {
		this.symbolInfoList.filterSymbolInfo(this.viewModel?.filteredBreakdowns ?? []);
		this.layoutPanel();
		this.setPanelPosition();
	}


	private renderSymbolListData(breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>) {
		const requestHeader = this.viewModel?.model.request?.message;
		const isLoading = this.requestInProgress.get() ?? false;
		this.symbolInfoList.show(requestHeader, isLoading);
		this.symbolInfoList.updateSymbolInfo(breakdowns);
	}

	private layoutPanel() {
		//
	}

	cancelRequest(): void {
		if (this.viewModel?.sessionId) {
			this.aideProbeService.cancelCurrentRequestForSession(this.viewModel.sessionId);
		}
		this.requestInProgress.set(this.viewModel?.requestInProgress ?? true);
		this.requestIsActive.set(false);
		this.contextElement.classList.remove('active');
	}

	clear(): void {
		this.aideProbeService.clearSession();
		this.viewModel?.dispose();
		this.viewModel = undefined;
		this.requestInProgress.set(false);
		this.requestIsActive.set(false);
		this.symbolInfoList.hide();
		this.onDidChangeItems();
		this.contextElement.classList.remove('active');
	}


	layout(): void {
		const height = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);
		this._inputEditor.layout({ width: 400, height });
	}

	override dispose(): void {
		super.dispose();
	}

}
