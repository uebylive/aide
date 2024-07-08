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
import 'vs/css!./commandPalette';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
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
import { CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeSymbolInfo } from 'vs/workbench/contrib/aideProbe/browser/aideProbeSymbolInfo';
import { AideProbeViewModel, IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 24;

const COMMAND_PALETTE_POSITION_KEY = 'aide.commandPalette.widgetposition';
const COMMAND_PALETTE_Y_KEY = 'aide.commandPalette.widgety';

export class AideCommandPaletteWidget extends Disposable {

	readonly _container!: HTMLElement;
	private isVisible = false;
	private inputEditorHeight = 0;

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorContainer!: HTMLElement;
	private symbolInfoListContainer: HTMLElement;

	private requestInProgress: IContextKey<boolean>;
	private _resourceLabels: ResourceLabels;
	private _symbolInfoList: AideProbeSymbolInfo;

	private panelHeight: number = 200;


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


	get inputEditor() {
		return this._inputEditor;
	}

	private inputModel: ITextModel | undefined;
	private inputEditorHasFocus: IContextKey<boolean>;
	private inputEditorHasText: IContextKey<boolean>;
	private toolbar: MenuWorkbenchToolBar;

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


		this.requestInProgress = CONTEXT_PROBE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this.inputEditorHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.inputEditorHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this._container = container;


		const innerContainer = dom.append(this.container, $('.command-palette-inner-container'));

		this.symbolInfoListContainer = dom.append(this.container, $('.command-palette-panel'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(innerContainer));
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

		this._inputEditorContainer = dom.append(innerContainer, $('.command-palette-input-editor'));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([HoverController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorContainer, options, editorOptions));

		let inputModel = this.modelService.getModel(AideCommandPaletteWidget.INPUT_EDITOR_URI);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, AideCommandPaletteWidget.INPUT_EDITOR_URI, true);
			this._register(inputModel);
		}
		this.inputModel = inputModel;
		this._inputEditor.setModel(this.inputModel);
		this._inputEditor.render();

		this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
		this._symbolInfoList = this._register(this.instantiationService.createInstance(AideProbeSymbolInfo, this._resourceLabels));


		const toolbarContainer = dom.append(this._inputEditorContainer, $('.probe-input-toolbar-container'));
		this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AideProbeCommandPalette, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => {
				if ((action.id === 'workbench.action.aideCommandPalette.submitProbe') && action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemWithKb, action);
				}
				return;
			}
		}));
		this.toolbar.getElement().classList.add('probe-input-toolbar');


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
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
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

		this.setCoordinates();
		this.layout();
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

	private setYCoordinate(y: number): void {
		const [yMin, yMax] = this.yRange;
		y = Math.max(yMin, Math.min(y, yMax));
		this._container.style.top = `${y}px`;
	}

	private get yDefault() {
		return this.layoutService.mainContainerOffset.top;
	}

	private _yRange: [number, number] | undefined;
	private get yRange(): [number, number] {
		if (!this._yRange) {
			const isTitleBarVisible = this.layoutService.isVisible(Parts.TITLEBAR_PART, dom.getWindow(this.layoutService.activeContainer));
			const yMin = isTitleBarVisible ? 0 : this.layoutService.mainContainerOffset.top;
			// TODO - improve this,
			const yMax = this.layoutService.activeContainer.clientHeight - this._container.clientHeight;
			this._yRange = [yMin, yMax];
		}
		return this._yRange;
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

		this.setYCoordinate(y ?? this.yDefault);
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


	acceptInput(viewModel: AideProbeViewModel) {

		if (this.viewModel?.requestInProgress) {
			return;
		} else if (this.viewModel) {
			this.clear();
		}

		this.viewModel = viewModel;
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(() => {
			this.onDidChangeItems();
		}));

		this.viewModelDisposables.add(this.viewModel.onChangeActiveBreakdown((breakdown) => {
			this.aideProbeService.navigateBreakdown();
			this._symbolInfoList.openSymbolInfoReference(breakdown);
		}));

		const editorValue = this.inputEditor.getValue();
		const result = this.aideProbeService.initiateProbe(this.viewModel.model, editorValue);

		if (result) {
			this.onDidChangeItems();
			return result.responseCreatedPromise;
		}

		return undefined;
	}

	private onDidChangeItems(): void {
		if (this.viewModel?.requestInProgress) {
			this.requestInProgress.set(true);
		} else {
			this.requestInProgress.set(false);
		}

		if ((this.viewModel?.model.response?.breakdowns.length) ?? 0 > 0) {
			this.renderSymbolListData(this.viewModel?.breakdowns ?? [], this.symbolInfoListContainer);
			dom.show(this.symbolInfoListContainer);
		} else {
			this._symbolInfoList.hide();
			dom.hide(this.symbolInfoListContainer);
		}

		if (this.panelHeight) {
			this.layoutPanel(this.panelHeight);
		}
	}


	private layoutPanel(height: number) {
		this.panelHeight = height;
		this._symbolInfoList.layout(height);
	}

	cancelRequest(): void {
		if (this.viewModel?.sessionId) {
			this.aideProbeService.cancelCurrentRequestForSession(this.viewModel.sessionId);
		}
	}

	clear(): void {
		this.aideProbeService.clearSession();
		this.viewModel?.dispose();
		this.viewModel = undefined;
		this.requestInProgress.set(false);
		this._symbolInfoList.hide();
		this.onDidChangeItems();
	}

	private renderSymbolListData(breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>, container: HTMLElement) {
		this._symbolInfoList.show(container);
		this._symbolInfoList.updateSymbolInfo(breakdowns);
	}


	layout(): void {
		const height = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);
		this._inputEditor.layout({ width: 400, height });
	}

	override dispose(): void {
		super.dispose();
	}

}
