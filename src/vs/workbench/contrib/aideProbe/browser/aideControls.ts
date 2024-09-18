/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { equals } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename, basenameOrAuthority } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { DocumentSymbol } from '../../../../editor/common/languages.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IOutlineModelService, OutlineElement } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { localize } from '../../../../nls.js';
import { ActionViewItemWithKb } from '../../../../platform/actionbarWithKeybindings/browser/actionViewItemWithKb.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { inputPlaceholderForeground } from '../../../../platform/theme/common/colors/inputColors.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { SIDE_BAR_BACKGROUND } from '../../../../workbench/common/theme.js';
import { clearProbeView, showProbeView } from '../../../../workbench/contrib/aideProbe/browser/aideProbe.js';
import { CONTEXT_PROBE_ARE_CONTROLS_ACTIVE, CONTEXT_PROBE_HAS_SELECTION, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_STATUS } from '../../../../workbench/contrib/aideProbe/browser/aideProbeContextKeys.js';
import { AideProbeModel, IVariableEntry } from '../../../../workbench/contrib/aideProbe/browser/aideProbeModel.js';
import { IAideProbeService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeService.js';
import { AideProbeScope, AideProbeStatus, AnchorEditingSelection, IAideProbeStatus } from '../../../../workbench/contrib/aideProbe/common/aideProbe.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IOutline, IOutlineService, OutlineTarget } from '../../../../workbench/services/outline/browser/outline.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IBottomBarPartService } from '../../../services/bottomBarPart/browser/bottomBarPartService.js';
import { IPinnedContextService } from '../../pinnedContext/common/pinnedContext.js';
import { SetAideProbeScopePinnedContext, SetAideProbeScopeSelection, SetAideProbeScopeWholeCodebase } from './actions/aideProbeActions.js';
import { IAideControlsService } from './aideControlsService.js';
import './media/aideControls.css';

const $ = dom.$;
const INPUT_MIN_HEIGHT = 36;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

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
	private part = this.bottomBarPartService.mainPart;
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

	private toolbarElement: HTMLElement | undefined;

	private inputHasText: IContextKey<boolean>;
	private inputHasFocus: IContextKey<boolean>;
	private areControlsActive: IContextKey<boolean>;
	private probeStatus: IContextKey<IAideProbeStatus>;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private probeHasSelection: IContextKey<boolean>;

	private model: AideProbeModel | undefined;
	private lastUsedSelection: AnchorEditingSelection | undefined;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;
	private resourceLabels: ResourceLabels | undefined;
	private anchoredContext: string = '';
	private readonly resourceLabelDisposables = this._register(new DisposableStore());
	private readonly currentOutline = new MutableDisposable<IOutline<any>>();
	private readonly outlineDisposables = this._register(new DisposableStore());
	private outlineCancellationTokenSource: CancellationTokenSource | undefined;

	constructor(
		@IBottomBarPartService private readonly bottomBarPartService: IBottomBarPartService,
		@IAideControlsService private readonly aideControlsService: IAideControlsService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
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
		@IPinnedContextService private readonly pinnedContextService: IPinnedContextService,
	) {
		super(themeService);

		this.themeService = themeService;
		aideControlsService.registerControls(this);
		this.resourceLabels = this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));

		this.areControlsActive = CONTEXT_PROBE_ARE_CONTROLS_ACTIVE.bindTo(contextKeyService);
		this.inputHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.probeHasSelection = CONTEXT_PROBE_HAS_SELECTION.bindTo(contextKeyService);

		const element = this.element = $('.aide-controls');
		this.part.content.appendChild(element);
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';

		const aideControlSettings = dom.append(element, $('.aide-controls-settings'));
		this.aideControlEditScope = dom.append(aideControlSettings, $('.aide-controls-edit-focus'));
		const scopeSelect = new SelectBox(
			<ISelectOptionItem[]>[
				{
					text: localize('selectedRange', "Selected Range"),
					description: localize('selectedRangeDescription', "The range of text selected in the editor"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideProbeScopeSelection.ID)?.getLabel()
				},
				{
					text: localize('pinnedContext', "Pinned Context"),
					description: localize('pinnedContextDescription', "The files you have pinned as context for AI"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideProbeScopePinnedContext.ID)?.getLabel()
				},
				{
					text: localize('wholeCodebase', "Whole Codebase"),
					description: localize('wholeCodebaseDescription', "The entire codebase of the current workspace"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideProbeScopeWholeCodebase.ID)?.getLabel()
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
		scopeSelect.onDidSelect(e => {
			const newScope = e.index === 0 ? AideProbeScope.Selection : e.index === 1 ? AideProbeScope.PinnedContext : AideProbeScope.WholeCodebase;
			aideControlsService.scope = newScope;
		});
		scopeSelect.render(this.aideControlEditScope);

		const inputElement = $('.aide-controls-input-container');
		element.appendChild(inputElement);
		this._input = this.createInput(inputElement);

		this.toolbarElement = $('.aide-controls-toolbar');
		element.appendChild(this.toolbarElement);
		this.createToolbar(this.toolbarElement);

		this.layout();
		this.part.onDidSizeChange((size: dom.IDimension) => {
			this.layout(size.width, size.height);
		});

		this.checkActivation();
		this.updateOutline();
		this.updateScope(aideControlsService.scope);
		this.updateInputPlaceholder();
		this.checkEditorSelection();

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateOutline();
			this.updateInputPlaceholder();
			this.checkActivation();
			this.checkEditorSelection();
		}));

		this._register(this.aideControlsService.onDidChangeScope((scope) => {
			this.updateScope(scope);
			scopeSelect.select(scope === AideProbeScope.Selection ? 0 : scope === AideProbeScope.PinnedContext ? 1 : 2);
		}));

		this.probeStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);
		this.probeStatus.set(AideProbeStatus.INACTIVE);
	}

	private updateScope(scope: AideProbeScope) {
		this.updateInputPlaceholder();
		const scopeIcon = scope === AideProbeScope.Selection ? Codicon.listSelection : scope === AideProbeScope.PinnedContext ? Codicon.pinned : Codicon.repo;
		this.aideControlEditScope.classList.remove(...Array.from(this.aideControlEditScope.classList).filter(c => c.startsWith('codicon-')));
		this.aideControlEditScope.classList.add(...ThemeIcon.asClassNameArray(scopeIcon));
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
		this.anchoredContext = '';
	}

	private async updateAnchoredContext() {
		if (!this.resourceLabels) {
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

		const selection = editor.getSelection();
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
				this.anchoredContext = symbol.name;

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
			this.anchoredContext = `${basenameOrAuthority(resource)} from line ${selection.startLineNumber} to ${selection.endLineNumber}`;
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
			this.updateInputPlaceholder();
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
		const activeEditor = this.editorService.activeTextEditorControl;
		this.areControlsActive.set(isCodeEditor(activeEditor));
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
			const variables: IVariableEntry[] = this.pinnedContextService.getPinnedContexts().map(context => ({ id: context.toString(), name: `file:${basename(context)}`, value: context }));
			this.model = this.aideProbeService.startSession();
			this.aideProbeService.initiateProbe(this.model, editorValue, variables, this.aideControlsService.scope);
		} else {
			this.aideProbeService.addIteration(editorValue);
		}

		if (this.aideControlsService.scope === AideProbeScope.Selection && this.aideProbeService.anchorEditingSelection) {
			this.aideProbeService.fireNewEvent(
				{ kind: 'anchorStart', selection: this.aideProbeService.anchorEditingSelection }
			);
		}

		showProbeView(this.viewsService);
	}


	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {
			let placeholder = 'Start an edit across ';
			if (this.aideControlsService.scope === AideProbeScope.Selection) {
				placeholder += (this.anchoredContext.length > 0 ? this.anchoredContext : 'the selected range');
			} else if (this.aideControlsService.scope === AideProbeScope.PinnedContext) {
				placeholder += 'the pinned context';
			} else {
				placeholder += 'the whole codebase';
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
			this.layout();
		}));

		this.layout();
	}

	layout(width?: number, height?: number) {
		if (width === undefined) {
			width = this.part.dimension?.width ?? 0;
		}
		if (height === undefined) {
			height = this.part.dimension?.height ?? 0;
		}

		if (!width || !height) {
			return;
		}

		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		const toolbarWidth = this.toolbarElement?.clientWidth ?? 0;
		this._input.layout({ width: width - 72 /* gutter */ - 14 /* scrollbar */ - toolbarWidth, height: height });
	}
}
