/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { ButtonBar } from '../../../../base/browser/ui/button/button.js';
import { Orientation, Sash } from '../../../../base/browser/ui/sash/sash.js';
import { equals } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { DocumentSymbol, SymbolKind, SymbolKinds } from '../../../../editor/common/languages.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IOutlineModelService, OutlineElement } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { localize } from '../../../../nls.js';
import { ActionViewItemWithKb } from '../../../../platform/actionbarWithKeybindings/browser/actionViewItemWithKb.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { inputPlaceholderForeground } from '../../../../platform/theme/common/colors/inputColors.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { getWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { SIDE_BAR_BACKGROUND } from '../../../../workbench/common/theme.js';
import { ContextPicker } from '../../../../workbench/contrib/aideProbe/browser/aideContextPicker.js';
import { IAideLSPService } from '../../../../workbench/contrib/aideProbe/browser/aideLSPService.js';
import { clearProbeView, showProbeView } from '../../../../workbench/contrib/aideProbe/browser/aideProbe.js';
import { CONTEXT_PROBE_ARE_CONTROLS_ACTIVE, CONTEXT_PROBE_HAS_SELECTION, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_REQUEST_STATUS } from '../../../../workbench/contrib/aideProbe/browser/aideProbeContextKeys.js';
import { AideProbeModel, IVariableEntry } from '../../../../workbench/contrib/aideProbe/browser/aideProbeModel.js';
import { IAideProbeService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeService.js';
import { AideProbeMode, AideProbeStatus, AnchorEditingSelection, IAideProbeMode, IAideProbeStatus } from '../../../../workbench/contrib/aideProbe/common/aideProbe.js';
import { IParsedChatRequest } from '../../../../workbench/contrib/aideProbe/common/aideProbeParserTypes.js';
import { ChatRequestParser } from '../../../../workbench/contrib/aideProbe/common/aideProbeRequestParser.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { IAideControlsPartService } from '../../../../workbench/services/aideControlsPart/browser/aideControlsPartService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IOutline, IOutlineService, OutlineTarget } from '../../../../workbench/services/outline/browser/outline.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import './media/aideControls.css';

const $ = dom.$;
const MAX_WIDTH = 800;
const INPUT_MIN_HEIGHT = 36;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

export const IAideControlsService = createDecorator<IAideControlsService>('IAideControlsService');

export interface IAideControlsService {
	_serviceBrand: undefined;
	controls: AideControls | undefined;
	registerControls(controls: AideControls): void;
	acceptInput(): void;
	focusInput(): void;
	blurInput(): void;
}

export class AideControlsService implements IAideControlsService {
	_serviceBrand: undefined;
	private _controls: AideControls | undefined;

	get controls() {
		return this._controls;
	}

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
	}

	registerControls(controls: AideControls): void {
		if (!this._controls) {
			this._controls = controls;
		} else {
			console.warn('AideControls already registered');
		}
	}

	acceptInput(): void {
		if (this._controls) {
			this._controls.acceptInput();
		}
	}

	focusInput(): void {
		if (this._controls) {
			this._controls.focusInput();
		}
	}

	blurInput(): void {
		if (this._controls) {
			const activeEditor = this.codeEditorService.listCodeEditors().find(editor => !editor.hasTextFocus());
			if (activeEditor) {
				activeEditor.focus();
			}
		}
	}
}


registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Eager);

export interface IAideControlsContrib extends IDisposable {
	readonly id: string;

	/**
	 * A piece of state which is related to the input editor of the chat widget
	 */
	getInputState?(): any;

	onDidChangeInputState?: Event<void>;

	/**
	 * Called with the result of getInputState when navigating input history.
	 */
	setInputState?(s: any): void;
}


export interface IAideControls {
	readonly inputEditor: CodeEditorWidget;
	getContrib<T extends IAideControlsContrib>(id: string): T | undefined;
}

export class AideControls extends Themable implements IAideControls {

	public static readonly ID = 'workbench.contrib.aideControls';

	// TODO(@g-danna): Make sure we get the right part in the auxilliary editor, not just the main one
	private part = this.aideControlsPartService.mainPart;
	private element: HTMLElement;

	public static readonly INPUT_CONTRIBS: { new(...args: [IAideControls, ...any]): IAideControlsContrib }[] = [];
	private contribs: ReadonlyArray<IAideControlsContrib> = [];
	getContrib<T extends IAideControlsContrib>(id: string): T | undefined {
		return this.contribs.find(c => c.id === id) as T;
	}

	private _input: CodeEditorWidget;
	get inputEditor() {
		return this._input;
	}
	private inputHeight = INPUT_MIN_HEIGHT;
	static readonly INPUT_SCHEME = 'aideControlsInput';
	private static readonly INPUT_URI = URI.parse(`${this.INPUT_SCHEME}:input`);


	private parsedChatRequest: IParsedChatRequest | undefined;
	get parsedInput() {
		if (this.parsedChatRequest === undefined) {
			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.inputEditor.getValue());
		}

		return this.parsedChatRequest;
	}

	private contextPicker: ContextPicker;


	//private toolbar: MenuWorkbenchToolBar;

	private inputHasText: IContextKey<boolean>;
	private inputHasFocus: IContextKey<boolean>;
	private areControlsActive: IContextKey<boolean>;
	private probeMode: IContextKey<IAideProbeMode>;
	private probeStatus: IContextKey<IAideProbeStatus>;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private probeHasSelection: IContextKey<boolean>;

	private model: AideProbeModel | undefined;
	private lastUsedSelection: AnchorEditingSelection | undefined;

	private topSash: Sash;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;
	private resourceLabels: ResourceLabels | undefined;
	private anchoredContextContainer: HTMLElement | undefined;
	private readonly resourceLabelDisposables = this._register(new DisposableStore());
	private readonly currentOutline = new MutableDisposable<IOutline<any>>();
	private readonly outlineDisposables = this._register(new DisposableStore());
	private outlineCancellationTokenSource: CancellationTokenSource | undefined;

	constructor(
		@IAideControlsPartService private readonly aideControlsPartService: IAideControlsPartService,
		@IAideControlsService aideControlsService: IAideControlsService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IAideLSPService private readonly aideLSPService: IAideLSPService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService themeService: IThemeService,
		@IViewsService private readonly viewsService: IViewsService,
		@IModelService private readonly modelService: IModelService,
		@IOutlineService private readonly outlineService: IOutlineService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(themeService);

		this.themeService = themeService;
		aideControlsService.registerControls(this);
		this.resourceLabels = this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));

		this.areControlsActive = CONTEXT_PROBE_ARE_CONTROLS_ACTIVE.bindTo(contextKeyService);
		this.inputHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.probeHasSelection = CONTEXT_PROBE_HAS_SELECTION.bindTo(contextKeyService);
		this.probeMode = CONTEXT_PROBE_MODE.bindTo(contextKeyService);
		this.probeMode.set(AideProbeMode.ANCHORED);

		const element = this.element = $('.aide-controls');
		this.part.element.appendChild(element);
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';

		this.anchoredContextContainer = $('.aide-controls-anchored-symbol');
		element.appendChild(this.anchoredContextContainer);

		const inputElement = $('.aide-controls-input-container');
		element.appendChild(inputElement);
		const toolbarElement = $('.aide-controls-toolbar');
		element.appendChild(toolbarElement);

		this._input = this.createInput(inputElement);


		this.topSash = instantiationService.createInstance(Sash, this.element, { getHorizontalSashTop: () => 0, getHorizontalSashWidth: () => this.element.offsetWidth }, { orientation: Orientation.HORIZONTAL });

		this._register(this.topSash.onDidStart((dragStart) => {
			const initialHeight = this.part.height;
			const initialY = dragStart.currentY;
			const onDragEvent = this._register(this.topSash.onDidChange((dragChange) => {
				const delta = dragChange.currentY - initialY;
				const newHeight = initialHeight - delta;
				this.part.layout(undefined, newHeight);
			}));

			const onDragEndEvent = this._register(this.topSash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));

		this.layout(this.part.width, this.part.height);

		this.part.onDidSizeChange((size: dom.IDimension) => {
			this.layout(size.width, size.height);
		});

		this.contextPicker = getWorkbenchContribution<ContextPicker>(ContextPicker.ID);
		this.contextPicker.append(inputElement);

		const toggleBarElement = $('.aide-controls-toggle-bar');
		toolbarElement.appendChild(toggleBarElement);
		const toggleBar = this.instantiationService.createInstance(ButtonBar, toggleBarElement);
		const anchorMode = this._register(toggleBar.addButton({
			...defaultButtonStyles,
		}));
		anchorMode.label = 'Anchored editing';
		anchorMode.onDidClick(() => {
			this.probeMode.set(AideProbeMode.ANCHORED);
		});
		const agentMode = this._register(toggleBar.addButton({
			...defaultButtonStyles,
			secondary: true
		}));
		agentMode.label = 'Agentic editing';
		agentMode.element.style.opacity = '0.4';
		agentMode.onDidClick(() => {
			this.probeMode.set(AideProbeMode.AGENTIC);
		});
		this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_PROBE_MODE.key]))) {
				anchorMode.element.style.opacity = this.probeMode.get() === AideProbeMode.ANCHORED ? '1' : '0.4';
				agentMode.element.style.opacity = this.probeMode.get() === AideProbeMode.AGENTIC ? '1' : '0.4';
			} else if (e.affectsSome(new Set([CONTEXT_PROBE_INPUT_HAS_FOCUS.key]))) {
				this.updateInputPlaceholder();
			}
		});

		this.createToolbar(toolbarElement);

		this.checkActivation();
		this.updateOutline();
		this.updateInputPlaceholder();
		this.checkEditorSelection();

		this._register(this.aideLSPService.onDidChangeStatus(() => {
			this.updateInputPlaceholder();
			this.checkActivation();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateOutline();
			this.updateInputPlaceholder();
			this.checkActivation();
			this.checkEditorSelection();
		}));

		this.probeStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);
		this.probeStatus.set(AideProbeStatus.INACTIVE);
	}

	private sendContextChange() {
		const filesInContext = Array.from(this.contextPicker.context.entries).filter(entry => entry.isFile) as unknown as { resource: URI }[];
		const newContext = filesInContext.map(entry => entry.resource.fsPath);
		const anchoredSelectionFile = this.aideProbeService.anchorEditingSelection?.uri.fsPath;
		if (anchoredSelectionFile) {
			newContext.push(anchoredSelectionFile);
		}

		if (this.probeStatus.get() !== AideProbeStatus.IN_PROGRESS) {
			this.aideProbeService.onContextChange(newContext);
		}
	}

	private updateOutline() {
		this.outlineDisposables.clear();
		this.outlineCancellationTokenSource?.dispose();

		const newCts = this.outlineCancellationTokenSource = new CancellationTokenSource();
		const editor = this.editorService.activeEditorPane;
		if (editor) {
			this.outlineService.createOutline(editor, OutlineTarget.Breadcrumbs, newCts.token).then(outline => {
				if (newCts.token.isCancellationRequested) {
					outline?.dispose();
					outline = undefined;
				}
				this.currentOutline.value = outline;
				this.updateAnchoredContext();
				if (outline) {
					this.outlineDisposables.add(outline.onDidChange(() => {
						this.updateAnchoredContext();
					}));
				} else {
					this.clearAnchors();
				}
			}).catch(() => {
				this.currentOutline.clear();
				this.updateAnchoredContext();
			});

			if (editor.onDidChangeSelection) {
				this.outlineDisposables.add(editor.onDidChangeSelection(() => {
					this.updateAnchoredContext();
				}));
			}
		}
	}

	private clearAnchors() {
		this.resourceLabelDisposables.clear();
		this.resourceLabels?.clear();
		if (this.anchoredContextContainer) {
			dom.clearNode(this.anchoredContextContainer);
		}
	}

	private async updateAnchoredContext() {
		if (!this.anchoredContextContainer || !this.resourceLabels) {
			this.clearAnchors();
			return;
		}

		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			this.clearAnchors();
			return;
		}

		const model = editor.getModel();
		const resource = editor.getModel()?.uri;
		if (!model || !resource) {
			this.clearAnchors();
			return;
		}

		const activeSelection = editor.getSelection();
		let selection: Selection | null = activeSelection;
		if (activeSelection && activeSelection.isEmpty()) {
			selection = null;
		}

		if (!selection) {
			if (!this.currentOutline.value) {
				this.clearAnchors();
				this.layout();
				return;
			}

			const breadcrumbsElements = this.currentOutline.value.config.breadcrumbsDataSource.getBreadcrumbElements();
			if (breadcrumbsElements && breadcrumbsElements.length > 0) {
				this.clearAnchors();

				const outline = breadcrumbsElements[0] as OutlineElement;
				const symbol = outline.symbol;
				const symbolLabel = this.resourceLabels.create(this.anchoredContextContainer, { supportHighlights: true });
				symbolLabel.setResource({ resource, name: symbol.name, description: basenameOrAuthority(resource) }, {
					fileKind: FileKind.FILE,
					icon: SymbolKinds.toIcon(symbol.kind),
				});

				this.aideProbeService.anchorEditingSelection = {
					uri: resource, selection: new Selection(
						symbol.range.startLineNumber,
						symbol.range.startColumn,
						symbol.range.endLineNumber,
						symbol.range.endColumn,
					), symbols: [symbol]
				};
				this.layout();
			} else {
				this.clearAnchors();
				this.layout();
			}
		} else {
			this.clearAnchors();

			const symbolLabel = this.resourceLabels.create(this.anchoredContextContainer, { supportHighlights: true });

			const label = `${basenameOrAuthority(resource)}:${selection.startLineNumber}-${selection.endLineNumber}`;
			symbolLabel.setResource({ resource, name: label, description: basenameOrAuthority(resource) }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(SymbolKind.File),
			});
			const anchorEditingSelection: AnchorEditingSelection = {
				uri: resource, selection: selection, symbols: []
			};

			const outlineModel = await this.outlineModelService.getOrCreate(model, this.outlineCancellationTokenSource?.token ?? CancellationToken.None);
			if (outlineModel) {
				const symbols: DocumentSymbol[] = [];
				for (const symbol of outlineModel.getTopLevelSymbols()) {
					if (selection.intersectRanges(symbol.range)) {
						symbols.push(symbol);
					}
				}

				anchorEditingSelection.symbols = symbols;
			}

			this.aideProbeService.anchorEditingSelection = anchorEditingSelection;
			this.layout();
		}
	}

	private checkEditorSelection() {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor)) {
			this.activeEditorDisposables.add(activeEditor.onDidChangeCursorSelection((event) => {
				const isValid = event.selection !== null && !event.selection.isEmpty();
				this.probeHasSelection.set(isValid);
			}));
		} else {
			this.activeEditorDisposables.clear();
		}
	}

	private checkActivation() {
		const isLSPActive = this.aideLSPService.isActiveForCurrentEditor();
		const activeEditor = this.editorService.activeTextEditorControl;
		this.areControlsActive.set(isCodeEditor(activeEditor) && isLSPActive);
	}

	private createInput(parent: HTMLElement) {
		const editorOuterElement = $('.aide-controls-input');
		parent.appendChild(editorOuterElement);
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(editorOuterElement));

		const editorElement = $('.aide-controls-input-editor');
		editorOuterElement.appendChild(editorElement);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));
		const defaultOptions = getSimpleEditorOptions(this.configurationService);
		const options: IEditorConstructionOptions = {
			...defaultOptions,
			overflowWidgetsDomNode: editorElement,
			readOnly: false,
			ariaLabel: localize('chatInput', "Start a task or exploration"),
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
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID]));
		const editor = this._input = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, options, editorOptions));
		let editorModel = this.modelService.getModel(AideControls.INPUT_URI);
		if (!editorModel) {
			editorModel = this.modelService.createModel('', null, AideControls.INPUT_URI, true);
			this._register(editorModel);
		}
		editor.setModel(editorModel);
		editor.render();

		this.codeEditorService.registerDecorationType(inputPlaceholder.description, inputPlaceholder.decorationType, {});

		this._register(editor.onDidChangeModelContent(() => {
			const currentHeight = Math.max(editor.getContentHeight(), INPUT_MIN_HEIGHT);

			const model = editor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			editorElement.classList.toggle('has-text', inputHasText);
			this.inputHasText.set(inputHasText);
			this.updateInputPlaceholder();
			if (inputHasText && model.getValue().trim().length === 1) {
				this.sendContextChange();
			}

			if (currentHeight !== this.inputHeight) {
				this.inputHeight = currentHeight;
			}
		}));

		this._register(editor.onDidFocusEditorText(() => {
			this.inputHasFocus.set(true);
		}));

		this._register(editor.onDidBlurEditorText(() => {
			this.inputHasFocus.set(false);
		}));

		return editor;
	}

	acceptInput() {
		return this._acceptInput();
	}

	focusInput() {
		this._input.focus();
	}

	private _acceptInput() {
		const currentSession = this.aideProbeService.getSession();
		const editorValue = this._input.getValue();
		const activeEditor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(activeEditor)) { return; }

		let iterationRequest = !!currentSession;
		const currentSelection = this.aideProbeService.anchorEditingSelection;
		if (!equals(this.lastUsedSelection?.symbols.map(s => s.name), currentSelection?.symbols.map(s => s.name))) {
			iterationRequest = false;
			clearProbeView(this.viewsService, false);
		}

		this.lastUsedSelection = this.aideProbeService.anchorEditingSelection;
		if (!iterationRequest) {
			let variables: IVariableEntry[] = [];
			if (this.contextPicker) {
				variables = Array.from(this.contextPicker.context.entries);
			}
			this.model = this.aideProbeService.startSession();
			this.aideProbeService.initiateProbe(this.model, editorValue, variables, activeEditor.getModel());
		} else {
			this.aideProbeService.addIteration(editorValue);
		}

		if (this.probeMode.get() === AideProbeMode.ANCHORED && this.aideProbeService.anchorEditingSelection) {
			this.aideProbeService.fireNewEvent(
				{ kind: 'anchorStart', selection: this.aideProbeService.anchorEditingSelection }
			);
		}

		showProbeView(this.viewsService);
	}


	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {
			let placeholder = 'Start a task';
			if (!this.inputHasFocus.get()) {
				const keybinding = this.keybindingService.lookupKeybinding('workbench.action.aideProbe.focus');
				if (keybinding) {
					placeholder += ` (${keybinding.getLabel()})`;
				}
			}
			const editor = this.editorService.activeTextEditorControl;
			if (!editor || (editor && isCodeEditor(editor))) {
				const model = editor?.getModel();
				if (!model) {
					placeholder = 'Open a file to start using Aide';
				} else {
					// const languageId = model.getLanguageId();
					// TODO(@g-danna) - make or find a capitalize util
					// const capitalizedLanguageId = languageId.charAt(0).toUpperCase() + languageId.slice(1);

					// if (unsupportedLanguages.has(languageId)) {
					// 	placeholder = `Aide doesn't support ${capitalizedLanguageId}`;
					// } else {
					// 	const isLSPActive = this.aideLSPService.getStatus(languageId);
					// 	if (!isLSPActive) {
					// 		placeholder = `Loading language server for ${capitalizedLanguageId}...`;
					// 	}
					// }
				}
			}

			const theme = this.themeService.getColorTheme();
			const transparentForeground = theme.getColor(inputPlaceholderForeground);
			const decorationOptions: IDecorationOptions[] = [
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
			this._input.setDecorationsByType(inputPlaceholder.description, inputPlaceholder.decorationType, decorationOptions);
		} else {
			this._input.removeDecorationsByType(inputPlaceholder.decorationType);
		}
	}

	private createToolbar(parent: HTMLElement) {
		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, parent, MenuId.AideControlsToolbar, {
			menuOptions: {
				shouldForwardArgs: true,

			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemWithKb, action);
				}
				return;
			}
		}));
		toolbar.getElement().classList.add('aide-controls-submit-toolbar');

		this._register(toolbar.onDidChangeMenuItems(() => {
			const width = toolbar.getItemsWidth();
			const numberOfItems = toolbar.getItemsLength();
			toolbar.getElement().style.width = `${width + Math.max(0, numberOfItems - 1) * 8}px`;
		}));
	}

	layout(width: number = this.part.width, height: number = this.part.height) {
		const newWidth = Math.min(width, MAX_WIDTH);
		this.element.style.width = `${newWidth}px`;
		this._input.layout({ width: newWidth - 60 - 16, height: height - 6 - 36 - (this.anchoredContextContainer?.offsetHeight ?? 0) });
		this.topSash.layout();
	}
}
