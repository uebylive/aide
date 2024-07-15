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
import { CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_REQUEST_IN_PROGRESS, CONTEXT_PROBE_IS_ACTIVE, CONTEXT_PROBE_MODE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideCommandPalettePanel } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPalettePanel';
import { AideProbeViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { IAideProbeService, ProbeMode } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { AideProbeViewPane } from 'vs/workbench/contrib/aideProbe/browser/aideProbeView';
import { VIEW_ID as PROBE_VIEW_ID } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 24;

const COMMAND_PALETTE_POSITION_KEY = 'aide.commandPalette.widgetposition';
const COMMAND_PALETTE_Y_KEY = 'aide.commandPalette.widgety';

const decorationDescription = 'command-palette';
const placeholderDecorationType = 'command-palette-detail';

export class AideCommandPaletteWidget extends Disposable {


	private isVisible = false;
	private inputEditorHeight = 0;

	private isPanelVisible = false;

	private get yDefault() {
		return this.layoutService.mainContainerOffset.top;
	}

	readonly _container!: HTMLElement;
	private width: number = 560;

	private _inputContainer: HTMLElement; // contains all inputs
	private _inputEditorContainer: HTMLElement;
	private _inputEditor: CodeEditorWidget;

	private mode: IContextKey<ProbeMode>;
	private contextElement: HTMLElement;


	get inputEditor() {
		return this._inputEditor;
	}

	private submitToolbar: MenuWorkbenchToolBar;
	private inputModel: ITextModel | undefined;
	private inputEditorHasFocus: IContextKey<boolean>;
	private inputEditorHasText: IContextKey<boolean>;

	private requestInProgress: IContextKey<boolean>;
	private requestIsActive: IContextKey<boolean>;

	private _focusIndex: number | undefined;
	get focusIndex(): number | undefined {
		return this._focusIndex;
	}

	private panelContainer: HTMLElement;
	private resourceLabels: ResourceLabels;
	private panel: AideCommandPalettePanel;

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
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IThemeService private readonly themeService: IThemeService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();

		this.mode = CONTEXT_PROBE_MODE.bindTo(contextKeyService);
		this.inputEditorHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.requestInProgress = CONTEXT_PROBE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);
		this.requestIsActive = CONTEXT_PROBE_IS_ACTIVE.bindTo(contextKeyService);

		this._container = container;

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		const innerContainer = dom.append(this.container, $('.command-palette-inner-container'));

		this.panelContainer = dom.append(this.container, $('.command-palette-panel'));
		dom.hide(this.panelContainer);

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


		// Toggle

		//const hoverDelegate = this._register(createInstantHoverDelegate());
		//const toggle = this._register(new Toggle({
		//	...defaultToggleStyles,
		//	icon: Codicon.telescope,
		//	title: nls.localize('mode', "Explore mode"),
		//	isChecked: false,
		//	hoverDelegate,
		//}));
		//
		//this._register(toggle.onChange(() => {
		//	toggle.setIcon(toggle.checked ? Codicon.pencil : Codicon.telescope);
		//	toggle.setTitle(toggle.checked ? nls.localize('editMode', "Edit mode") : nls.localize('followAlong', "Probe mode"));
		//	this.mode = toggle.checked ? 'edit' : 'explore';
		//}));
		//innerContainer.appendChild(toggle.domNode);

		// Input editor
		this._inputEditorContainer = dom.append(this._inputContainer, $('.command-palette-input-editor'));
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(this._inputEditorContainer));
		const editorWrapper = dom.append(this._inputEditorContainer, $('.command-palette-input-editor-wrapper'));
		CONTEXT_IN_PROBE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const defaultOptions = getSimpleEditorOptions(this.configurationService);
		const options: IEditorConstructionOptions = {
			...defaultOptions,
			readOnly: false,
			ariaLabel: this._getAriaLabel(),
			fontFamily: DEFAULT_FONT_FAMILY,
			fontSize: 13,
			lineHeight: 20,
			padding: { top: 8, bottom: 8 },
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			bracketPairColorization: { enabled: false },
			suggest: {
				showIcons: false,
				showSnippets: false,
				showWords: true,
				showStatusBar: false,
				insertMode: 'replace',
			},
			scrollbar: { ...(defaultOptions.scrollbar ?? {}), vertical: 'hidden' }
		};

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
		this.panel = this._register(this.instantiationService.createInstance(AideCommandPalettePanel, this.resourceLabels, this.panelContainer));

		// Submit toolbar

		this.submitToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this._inputContainer, MenuId.AideCommandPaletteSubmit, {
			menuOptions: {
				shouldForwardArgs: true,
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemWithKb, action);
				}
				return;
			}
		}));
		this.submitToolbar.getElement().classList.add('command-palette-submit-toolbar');

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

			if (!this.requestInProgress.get() && this.requestIsActive.get() && this.viewModel) {
				this.viewModel.setFilter(this._inputEditor.getValue());
			}

			if (currentHeight !== this.inputEditorHeight) {
				this.layoutInputs();
				this.setPanelPosition();
				this._onDidChangeHeight.fire();
				this.inputEditorHeight = currentHeight;
			}


			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this._inputEditorContainer.classList.toggle('has-text', inputHasText);
			this.inputEditorHasText.set(inputHasText);
			this.updateInputEditorPlaceholder();
		}));

		this._register(this.submitToolbar.onDidChangeMenuItems(() => {
			this.layoutInputs();
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
				dom.getWindow(this.layoutService.activeContainer), dom.EventType.RESIZE, () => {
					this.setCoordinates();
					this.layoutInputs();
				})
			);
		};
		registerResizeListener();

		this._register(this.panel.onDidChangeFocus(e => {
			this._focusIndex = e.index;
		}));

		this.setCoordinates();
	}

	setFocusIndex(index: number, browserEvent?: UIEvent) {
		this.panel.setFocus(index, browserEvent);
	}

	setMode(mode: ProbeMode) {
		this.mode.set(mode);
		this.updateInputEditorPlaceholder();
	}

	private updateInputEditorPlaceholder() {
		if (!this.inputEditorHasText.get()) {
			const theme = this.themeService.getColorTheme();
			const transparentForeground = theme.getColor(inputPlaceholderForeground);
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: this.mode.get() === 'explore' ? 'Ask to explore your codebase' : 'Ask to edit your codebase',
							color: transparentForeground?.toString(),
						}
					}
				}
			];

			this._inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
		} else {
			this._inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
		}
	}

	private layoutInputs() {
		const itemsCount = this.submitToolbar.getItemsLength();
		const submitToolbarWidth = this.submitToolbar.getItemsWidth();

		const currentWindow = dom.getWindow(this.layoutService.activeContainer);
		const maxWidth = Math.min(this.width, currentWindow.innerWidth - 100);
		this.inputEditor.layout({ height: this._inputEditor.getContentHeight(), width: maxWidth - submitToolbarWidth - (Math.min(0, itemsCount - 1) * 6) });
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
		if (this.isPanelVisible && this.panel && this.panel.contentHeight !== undefined) {
			const rect = this._container.getBoundingClientRect();
			if (rect.top < this.panel.contentHeight) {
				this.panelContainer.classList.add('top');
				this.panelContainer.classList.remove('bottom');
			} else {
				this.panelContainer.classList.add('bottom');
				this.panelContainer.classList.remove('top');
			}
		}
	}

	show(): void {
		this.updateInputEditorPlaceholder();
		this.focus();

		if (this.isVisible) {
			this.setCoordinates();
			return;
		}


		dom.show(this.container);
		this.isVisible = true;
		this.setCoordinates();
		this.layoutInputs();
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
			this.panel.openSymbolInfoReference(breakdown);
		}));

		const editorValue = this._inputEditor.getValue();
		const result = this.aideProbeService.initiateProbe(this.viewModel.model, editorValue, this.mode.get() === 'edit');

		this.panel.show(editorValue, true);

		this.inputEditor.setValue('');

		if (result) {
			this.onDidChangeItems();
			return result.responseCreatedPromise;
		}

		return editorValue;
	}

	private async onDidChangeItems() {
		const isRequestInProgress = this.viewModel?.requestInProgress ?? false;
		this.requestInProgress.set(isRequestInProgress);

		if (!this.viewModel?.sessionId) {
			const aideProbeView = await this.viewsService.openView<AideProbeViewPane>(PROBE_VIEW_ID);
			if (aideProbeView) {
				aideProbeView.acceptInput();
			}
		}

		const requestHeader = this.viewModel?.model.request?.message;
		this.panel.show(requestHeader, isRequestInProgress);


		if ((this.viewModel?.breakdowns.length) ?? 0 > 0) {
			this.panel.updateSymbolInfo(this.viewModel?.breakdowns ?? []);
			dom.show(this.panelContainer);
			this.isPanelVisible = true;
		} else {
			this.panel.hide();
			dom.hide(this.panelContainer);
			this.isPanelVisible = false;
		}

		this.setPanelPosition();
	}


	private onDidFilterItems() {
		this.panel.filterSymbolInfo(this.viewModel?.filteredBreakdowns ?? []);
		this.setPanelPosition();
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
		this.explanationService.clear();
		this.viewModel?.dispose();
		this.viewModel = undefined;
		this.requestInProgress.set(false);
		this.requestIsActive.set(false);
		this.panel.hide();
		this.onDidChangeItems();
		this.contextElement.classList.remove('active');
	}



	override dispose(): void {
		super.dispose();
	}
}
