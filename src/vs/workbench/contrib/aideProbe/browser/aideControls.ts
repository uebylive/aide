/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IDimension } from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { ISelectOptionItem, SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { equals } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/aideControls';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { Selection } from 'vs/editor/common/core/selection';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { DocumentSymbol, SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { IOutlineModelService, OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { FileKind } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IAideLSPService } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { clearProbeView, showProbeView } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { CONTEXT_PROBE_ARE_CONTROLS_ACTIVE, CONTEXT_PROBE_HAS_SELECTION, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeModel, IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeMode, AideProbeStatus, AnchorEditingSelection, IAideProbeMode, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IParsedChatRequest } from 'vs/workbench/contrib/aideProbe/common/aideProbeParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/aideProbe/common/aideProbeRequestParser';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IAideControlsPartService } from 'vs/workbench/services/aideControlsPart/browser/aideControlsPartService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutline, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

const $ = dom.$;
const INPUT_MIN_HEIGHT = 36;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

export const IAideControlsService = createDecorator<IAideControlsService>('IAideControlsService');

export enum AideProbeScope {
	Selection = 'Selection',
	PinnedContext = 'PinnedContext',
	WholeCodebase = 'WholeCodebase',
}

export interface IAideControlsService {
	_serviceBrand: undefined;
	onDidChangeScope: Event<AideProbeScope>;

	scope: AideProbeScope;
	readonly scopeSelection: number;
	controls: AideControls | undefined;
	registerControls(controls: AideControls): void;

	acceptInput(): void;
	focusInput(): void;
	blurInput(): void;
}

export class AideControlsService extends Disposable implements IAideControlsService {
	_serviceBrand: undefined;

	private _controls: AideControls | undefined;
	get controls() {
		return this._controls;
	}

	private _scope: AideProbeScope = AideProbeScope.Selection;
	private _onDidChangeScope = this._register(new Emitter<AideProbeScope>());
	readonly onDidChangeScope = this._onDidChangeScope.event;

	get scope() {
		return this._scope;
	}

	set scope(scope: AideProbeScope) {
		this._scope = scope;
		this._onDidChangeScope.fire(scope);
	}

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();
	}

	registerControls(controls: AideControls): void {
		if (!this._controls) {
			this._controls = controls;
		} else {
			console.warn('AideControls already registered');
		}
	}

	get scopeSelection(): Readonly<number> {
		if (this._scope === AideProbeScope.Selection) {
			return 0;
		} else if (this._scope === AideProbeScope.PinnedContext) {
			return 1;
		} else {
			return 2;
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
	private aideControlEditScope: HTMLElement;

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

	private actionsToolbar: MenuWorkbenchToolBar | undefined;

	private parsedChatRequest: IParsedChatRequest | undefined;
	get parsedInput() {
		if (this.parsedChatRequest === undefined) {
			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.inputEditor.getValue());
		}

		return this.parsedChatRequest;
	}

	private inputHasText: IContextKey<boolean>;
	private inputHasFocus: IContextKey<boolean>;
	private areControlsActive: IContextKey<boolean>;
	private probeMode: IContextKey<IAideProbeMode>;
	private probeStatus: IContextKey<IAideProbeStatus>;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private probeHasSelection: IContextKey<boolean>;

	private model: AideProbeModel | undefined;
	private lastUsedSelection: AnchorEditingSelection | undefined;

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
		@IAideControlsService private readonly aideControlsService: IAideControlsService,
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
		@IContextViewService private readonly contextViewService: IContextViewService,
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
		this.part.content.appendChild(element);
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';

		const aideControlSettings = dom.append(element, $('.aide-controls-settings'));
		this.aideControlEditScope = dom.append(aideControlSettings, $('.aide-controls-edit-focus'));
		const rangeSelection = new SelectBox(
			<ISelectOptionItem[]>[
				{
					text: localize('selectedRange', "Selected Range"),
					description: localize('selectedRangeDescription', "The range of text selected in the editor"),
				},
				{
					text: localize('pinnedContext', "Pinned Context"),
					description: localize('pinnedContextDescription', "The files you have pinned as context for AI"),
				},
				{
					text: localize('wholeCodebase', "Whole Codebase"),
					description: localize('wholeCodebaseDescription', "The entire codebase of the current workspace"),
				},
			],
			aideControlsService.scopeSelection,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				ariaLabel: localize('editFocus', 'Edit Focus'),
				useCustomDrawn: true,
				customDrawnDropdownWidth: 320
			}
		);
		rangeSelection.onDidSelect(e => {
			const newScope = e.index === 0 ? AideProbeScope.Selection : e.index === 1 ? AideProbeScope.PinnedContext : AideProbeScope.WholeCodebase;
			this.updateScope(newScope);
		});
		rangeSelection.render(this.aideControlEditScope);

		const inputElement = $('.aide-controls-input-container');
		element.appendChild(inputElement);
		const toolbarElement = $('.aide-controls-toolbar');
		element.appendChild(toolbarElement);

		this._input = this.createInput(inputElement);

		const partSize = this.part.dimension;
		if (partSize) {
			this.layout(partSize.width, partSize.height);
		}

		this.part.onDidSizeChange((size: IDimension) => {
			this.layout(size.width, size.height);
		});

		this.createToolbar(toolbarElement);

		this.checkActivation();
		this.updateOutline();
		this.updateScope(aideControlsService.scope);
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

		this._register(this.aideControlsService.onDidChangeScope((scope) => {
			this.updateScope(scope);
		}));

		this.probeStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);
		this.probeStatus.set(AideProbeStatus.INACTIVE);
	}

	private updateScope(scope: AideProbeScope) {
		this.aideControlsService.scope = scope;
		this.updateInputPlaceholder();
		const scopeIcon = scope === AideProbeScope.Selection ? Codicon.listSelection : scope === AideProbeScope.PinnedContext ? Codicon.pinned : Codicon.repo;
		this.aideControlEditScope.classList.remove(...Array.from(this.aideControlEditScope.classList).filter(c => c.startsWith('codicon-')));
		this.aideControlEditScope.classList.add(...ThemeIcon.asClassNameArray(scopeIcon));
	}

	private sendContextChange() {
		const filesInContext = [] as { resource: URI }[];
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
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));

		const editorElement = $('.aide-controls-input-editor');
		parent.appendChild(editorElement);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));
		const defaultOptions = getSimpleEditorOptions(this.configurationService);
		const options: IEditorConstructionOptions = {
			...defaultOptions,
			overflowWidgetsDomNode: editorElement,
			readOnly: false,
			ariaLabel: localize('chatInput', "Edit code"),
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
			this.updateInputPlaceholder();
		}));

		this._register(editor.onDidBlurEditorText(() => {
			this.inputHasFocus.set(false);
			this.updateInputPlaceholder();
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
			const variables: IVariableEntry[] = [];
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
			let placeholder = 'Start an edit across';
			if (this.aideControlsService.scope === AideProbeScope.Selection) {
				placeholder += ' the selected range';
			} else if (this.aideControlsService.scope === AideProbeScope.PinnedContext) {
				placeholder += ' the pinned context';
			} else {
				placeholder += ' the whole codebase';
			}

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
		const toolbar = this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, parent, MenuId.AideControlsToolbar, {
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

		this.layout();
	}

	layout(width?: number, height?: number) {
		if (width === undefined || height === undefined) {
			const partSize = this.part.dimension;
			if (partSize) {
				width = partSize.width;
				height = partSize.height;
			}
		}

		if (width === undefined || height === undefined) {
			return;
		}

		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		const toolbarWidth = this.actionsToolbar?.getElement().clientWidth ?? 0;
		this._input.layout({ width: width - 72 /* gutter */ - 14 /* scrollbar */ - toolbarWidth, height: height });
	}
}
