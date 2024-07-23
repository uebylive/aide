/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Button } from 'vs/base/browser/ui/button/button';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { CodeWindow, mainWindow } from 'vs/base/browser/window';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/commandPalette';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
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
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { AideCommandPalettePanel, IAideCommandPalettePanel } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPalettePanel';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PALETTE_IS_VISIBLE, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_IS_LSP_ACTIVE, CONTEXT_PROBE_MODE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { AideProbeStatus, IAideProbeResponseModel, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService, ProbeMode } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 24;

const COMMAND_PALETTE_POSITION_KEY = 'aide.commandPalette.widgetposition';
const COMMAND_PALETTE_Y_KEY = 'aide.commandPalette.widgety';

const decorationDescription = 'command-palette';
const placeholderDecorationType = 'command-palette-detail';

export interface IAideCommandPaletteWidget {
	readonly onDidChangeVisibility: Event<boolean>;
	setFocusIndex(index: number, browserEvent?: UIEvent): void;

	readonly focusIndex: number | undefined;
	readonly viewModel: AideProbeViewModel | undefined;

	show(): void;
	hide(): void;
	setMode(mode: ProbeMode): void;
	acceptInput(): string | Promise<IAideProbeResponseModel> | undefined;
	cancelRequest(): void;
	clear(): void;
	dispose(): void;
}

export class AideCommandPaletteWidget extends Disposable implements IAideCommandPaletteWidget {
	private isVisible: IContextKey<boolean>;
	private inputEditorHeight = 0;

	private isPanelVisible = false;

	private get yDefault() {
		return this.layoutService.mainContainerOffset.top;
	}

	readonly _container!: HTMLElement;
	private _innerContainer!: HTMLElement;
	private width: number = 560;

	private _inputContainer: HTMLElement; // contains all inputs
	private _modeToggleContainer: HTMLElement;
	private modeToggle: Button;
	private _inputEditorContainer: HTMLElement;
	private _inputEditor: CodeEditorWidget;

	private mode: IContextKey<ProbeMode>;

	private submitToolbar: MenuWorkbenchToolBar;
	private inputModel: ITextModel | undefined;
	private inputEditorHasFocus: IContextKey<boolean>;
	private inputEditorHasText: IContextKey<boolean>;
	private requestStatus: IContextKey<AideProbeStatus>;

	private _focusIndex: number | undefined;
	get focusIndex(): number | undefined {
		return this._focusIndex;
	}

	private panelContainer: HTMLElement;
	private resourceLabels: ResourceLabels;
	private panel: IAideCommandPalettePanel;

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
			this._viewModel?.dispose();
			this.viewModelDisposables.clear();
		}
	}

	get viewModel(): AideProbeViewModel | undefined {
		return this._viewModel;
	}

	/** coordinate of the command palette per aux window */
	private readonly auxWindowCoordinates = new WeakMap<CodeWindow, { x: number; y: number | undefined }>();

	private static readonly INPUT_EDITOR_URI = URI.parse('aideCommandPalette:input');

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

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
		@IThemeService private readonly themeService: IThemeService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();

		this.isVisible = CONTEXT_PALETTE_IS_VISIBLE.bindTo(contextKeyService);
		this.mode = CONTEXT_PROBE_MODE.bindTo(contextKeyService);
		this.inputEditorHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.requestStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);

		this._container = container;

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		this._innerContainer = dom.append(this.container, $('.command-palette-inner-container'));
		this.panelContainer = dom.append(this.container, $('.command-palette-panel'));
		dom.hide(this.panelContainer);
		this._inputContainer = dom.append(this._innerContainer, $('.command-palette-input'));

		// Input editor
		dom.append(this._inputContainer, $('.command-palette-logo'));
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



		// Toggle

		this._modeToggleContainer = dom.append(this._inputContainer, $('.command-palette-mode-flag'));
		this._modeToggleContainer.style.display = 'none';
		const hoverDelegate = this._register(createInstantHoverDelegate());
		const modeToggle = this.modeToggle = this._register(new Button(this._modeToggleContainer, {
			hoverDelegate,
		}));

		this._register(modeToggle.onDidClick(() => {
			this.mode.set(this.mode.get() === 'explore' ? 'edit' : 'explore');
			this.updateModeFlag();
		}));

		// Submit toolbar
		this.submitToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this._inputContainer, MenuId.AideCommandPaletteToolbar, {
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
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateInputEditorPlaceholder();
		}));

		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this.inputEditorHasFocus.set(true);
			this._inputEditorContainer.classList.toggle('focused', true);
		}));

		this._register(this._inputEditor.onDidBlurEditorText(() => {
			this.inputEditorHasFocus.set(false);
			this._inputEditorContainer.classList.toggle('focused', false);
		}));

		this._register(this._inputEditor.onDidChangeModelContent((event) => {
			const currentHeight = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);

			if (this.requestStatus.get() !== 'INACTIVE' && this._viewModel) {
				this._viewModel.setFilter(this._inputEditor.getValue());
			}

			if (currentHeight !== this.inputEditorHeight) {
				this.layoutInputs();
				this.setPanelPosition();
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

		this.updateModeFlag();
		this.setCoordinates();
		this.hide();
	}

	setFocusIndex(index: number, browserEvent?: UIEvent) {
		this.panel.setFocus(index, browserEvent);
	}

	setMode(mode: ProbeMode) {
		this.mode.set(mode);
		this.updateInputEditorPlaceholder();
		this.updateModeFlag();
	}

	private updateInputEditorPlaceholder() {
		if (!this.inputEditorHasText.get()) {
			const theme = this.themeService.getColorTheme();
			const transparentForeground = theme.getColor(inputPlaceholderForeground);


			let placeholder;
			if (this.requestStatus.get() !== 'INACTIVE') {
				placeholder = 'Filter through the results';
			} else {
				if (this.mode.get() === 'edit') {
					placeholder = 'Ask to edit your codebase';
				} else {
					placeholder = 'Ask to explore your codebase';
				}
			}


			if (!CONTEXT_PROBE_IS_LSP_ACTIVE.getValue(this.contextKeyService)) {
				const editor = this.editorService.activeTextEditorControl;
				if (!isCodeEditor(editor)) {
					return;
				}
				const model = editor.getModel();
				if (!model) {
					placeholder = 'Open a file to start using Aide';
				} else {
					const languageId = model.getLanguageId();
					const capitalizedLanguageId = languageId.charAt(0).toUpperCase() + languageId.slice(1);
					placeholder = `Language server is not active for ${capitalizedLanguageId}`;
				}
			}

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
							contentText: placeholder,
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
		const submitToolbarWidth = this.submitToolbar.getItemsWidth();

		const currentWindow = dom.getWindow(this.layoutService.activeContainer);
		const maxWidth = Math.min(this.width, currentWindow.innerWidth - 100);
		this._inputEditor.layout({ height: this._inputEditor.getContentHeight(), width: maxWidth - submitToolbarWidth - this._modeToggleContainer.clientWidth - 8 });
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel ? localize('actions.commandPalette.accessibiltyHelp', "Command palette input, Type to interact with Aide, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('commandPalette.accessibilityHelpNoKb', "Command palette input, Type to interact with Aide, press enter to run. Use the Command Palette Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat Input");
	}

	private focus() {
		this._inputEditor.focus();
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


	private updateModeFlag(): void {
		this.modeToggle.label = this.mode.get() === 'explore' ? localize('exploreMode', "Explore mode") : localize('editMode', "Edit mode");
		this.modeToggle.element.classList.toggle('edit-mode', this.mode.get() === 'edit');
		this.updateInputEditorPlaceholder();
		this.layoutInputs();
	}

	show(): void {
		this.updateInputEditorPlaceholder();

		if (this.isVisible.get()) {
			this.setCoordinates();
			this.focus();
			return;
		}

		dom.show(this.container);
		this.focus();
		this.layoutInputs();
		this.isVisible.set(true);
	}

	hide(): void {
		this.isVisible.set(false);
		dom.hide(this.container);

		this.panel.hide();
		this.isPanelVisible = false;
	}


	acceptInput() {
		return this._acceptInput();
	}

	private _acceptInput() {
		if (this._viewModel && this._viewModel.status !== IAideProbeStatus.INACTIVE) {
			return;
		} else if (this._viewModel) {
			this.clear();
		}

		const model = this.aideProbeService.startSession();
		model.status = IAideProbeStatus.IN_PROGRESS;

		const viewModel = this.viewModel = this.instantiationService.createInstance(AideProbeViewModel, model);
		this.viewModelDisposables.add(Event.accumulate(viewModel.onDidChange)(() => {
			this.onDidChangeItems();
		}));
		this.viewModelDisposables.add(Event.accumulate(viewModel.onDidFilter)(() => {
			this.onDidFilterItems();
		}));
		this.viewModelDisposables.add(viewModel.onChangeActiveBreakdown((breakdown) => {
			this.panel.openSymbolInfoReference(breakdown);
		}));

		const editorValue = this._inputEditor.getValue();
		const result = this.aideProbeService.initiateProbe(viewModel.model, editorValue, this.mode.get() === 'edit');
		this.requestStatus.set('IN_PROGRESS');

		this.isPanelVisible = true;
		dom.show(this.panelContainer);
		this.panel.show(editorValue, true);
		this._inputEditor.setValue('');

		if (result) {
			this.onDidChangeItems();
			return result.responseCreatedPromise;
		}

		return editorValue;
	}

	private async onDidChangeItems() {
		if (!this._viewModel) {
			return;
		}

		this.requestStatus.set(this._viewModel.status);

		if ((this._viewModel?.breakdowns.length) ?? 0 > 0) {
			this.panel.updateSymbolInfo(this._viewModel?.breakdowns ?? []);
			dom.show(this.panelContainer);
			this.isPanelVisible = true;
		} else if (this._viewModel?.lastFileOpened) {
			this.panel.emptyListPlaceholder.textContent = `Reading ${basename(this._viewModel.lastFileOpened.fsPath)}`;
		}

		this.panel.show(undefined, this.requestStatus.get() === 'IN_PROGRESS');

		this.setPanelPosition();
	}

	private onDidFilterItems() {
		this.panel.filterSymbolInfo(this._viewModel?.filteredBreakdowns ?? []);
		this.setPanelPosition();
	}

	cancelRequest(): void {
		this.aideProbeService.cancelProbe();
	}

	clear(): void {
		this.explanationService.clear();
		this.aideProbeService.cancelProbe();
		this.updateInputEditorPlaceholder();

		this._viewModel?.dispose();
		this._viewModel = undefined;

		this.requestStatus.set('INACTIVE');

		this.hide();
	}

	public override dispose(): void {
		this.storePosition();
		this.clear();
		super.dispose();
	}
}
