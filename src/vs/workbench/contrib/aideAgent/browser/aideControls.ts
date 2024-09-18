/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { IModelService } from '../../../../editor/common/services/model.js';
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
import { SIDE_BAR_BACKGROUND } from '../../../../workbench/common/theme.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IBottomBarPartService } from '../../../services/bottomBarPart/browser/bottomBarPartService.js';
import { AideAgentScope } from '../common/aideAgentModel.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { SetAideAgentScopePinnedContext, SetAideAgentScopeSelection, SetAideAgentScopeWholeCodebase } from './actions/aideAgentActions.js';
import { CONTEXT_AIDE_CONTROLS_HAS_FOCUS, CONTEXT_AIDE_CONTROLS_HAS_TEXT } from './aideAgentContextKeys.js';
import { IAideControlsService } from './aideControlsService.js';
import './media/aideControls.css';

const $ = dom.$;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

export class AideControls extends Themable {
	public static readonly ID = 'workbench.contrib.aideControls';

	private part = this.bottomBarPartService.mainPart;
	private aideControlEditScope: HTMLElement;

	private _input: CodeEditorWidget;
	static readonly INPUT_SCHEME = 'aideControlsInput';
	private static readonly INPUT_URI = URI.parse(`${this.INPUT_SCHEME}:input`);

	private toolbarElement: HTMLElement | undefined;

	private inputHasText: IContextKey<boolean>;
	private inputHasFocus: IContextKey<boolean>;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private anchoredContext: string = '';

	constructor(
		@IAideControlsService aideControlsService: IAideControlsService,
		@IAideAgentService private readonly aideAgentService: IAideAgentService,
		@IBottomBarPartService private readonly bottomBarPartService: IBottomBarPartService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@IThemeService protected override readonly themeService: IThemeService,
	) {
		super(themeService);
		aideControlsService.registerControls(this);

		const element = $('.aide-controls');
		this.part.content.appendChild(element);
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';

		this.inputHasText = CONTEXT_AIDE_CONTROLS_HAS_TEXT.bindTo(contextKeyService);
		this.inputHasFocus = CONTEXT_AIDE_CONTROLS_HAS_FOCUS.bindTo(contextKeyService);

		const aideControlSettings = dom.append(element, $('.aide-controls-settings'));
		this.aideControlEditScope = dom.append(aideControlSettings, $('.aide-controls-edit-focus'));
		const scopeSelect = new SelectBox(
			<ISelectOptionItem[]>[
				{
					text: localize('selectedRange', "Selected Range"),
					description: localize('selectedRangeDescription', "The range of text selected in the editor"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideAgentScopeSelection.ID)?.getLabel()
				},
				{
					text: localize('pinnedContext', "Pinned Context"),
					description: localize('pinnedContextDescription', "The files you have pinned as context for AI"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideAgentScopePinnedContext.ID)?.getLabel()
				},
				{
					text: localize('wholeCodebase', "Whole Codebase"),
					description: localize('wholeCodebaseDescription', "The entire codebase of the current workspace"),
					decoratorRight: this.keybindingService.lookupKeybinding(SetAideAgentScopeWholeCodebase.ID)?.getLabel()
				},
			],
			aideAgentService.scopeSelection,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				ariaLabel: localize('editFocus', 'Edit Focus'),
				useCustomDrawn: true,
				customDrawnDropdownWidth: 320
			}
		);
		scopeSelect.onDidSelect(e => {
			const newScope = e.index === 0 ? AideAgentScope.Selection : e.index === 1 ? AideAgentScope.PinnedContext : AideAgentScope.WholeCodebase;
			aideAgentService.scope = newScope;
		});
		scopeSelect.render(this.aideControlEditScope);

		const inputElement = $('.aide-controls-input-container');
		element.appendChild(inputElement);
		this._input = this.createInput(inputElement);
		this.updateInputPlaceholder();
		this.layout();

		this.aideAgentService.startSession();

		this.toolbarElement = $('.aide-controls-toolbar');
		element.appendChild(this.toolbarElement);
		this.createToolbar(this.toolbarElement);

		this.layout();
		this.part.onDidSizeChange((size: dom.IDimension) => {
			this.layout(size.width, size.height);
		});

		this.updateScope(aideAgentService.scope);
		this.updateInputPlaceholder();

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.trackActiveEditor();
		}));

		this._register(this.aideAgentService.onDidChangeScope((scope) => {
			this.updateScope(scope);
			scopeSelect.select(scope === AideAgentScope.Selection ? 0 : scope === AideAgentScope.PinnedContext ? 1 : 2);
		}));
	}

	private updateScope(scope: AideAgentScope) {
		this.updateInputPlaceholder();
		const scopeIcon = scope === AideAgentScope.Selection ? Codicon.listSelection : scope === AideAgentScope.PinnedContext ? Codicon.pinned : Codicon.repo;
		this.aideControlEditScope.classList.remove(...Array.from(this.aideControlEditScope.classList).filter(c => c.startsWith('codicon-')));
		this.aideControlEditScope.classList.add(...ThemeIcon.asClassNameArray(scopeIcon));
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
			this.inputHasText.set(editor.getValue().length > 0);
			this.updateInputPlaceholder();
			this.layout();
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
		const editorValue = this._input.getValue();
		if (editorValue.length === 0) {
			return;
		}

		this.aideAgentService.trigger(editorValue);
	}

	focusInput() {
		this._input.focus();
	}

	private trackActiveEditor() {
		this.activeEditorDisposables.clear();

		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return;
		}

		const resource = editor.getModel()?.uri;
		if (!resource) {
			return;
		}

		this.activeEditorDisposables.add(editor.onDidChangeCursorSelection(e => {
			const selection = e.selection;
			this.anchoredContext = `${basenameOrAuthority(resource)} from line ${selection.startLineNumber} to ${selection.endLineNumber}`;
			this.updateInputPlaceholder();
		}));
	}

	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {
			let placeholder = 'Start an edit across ';
			if (this.aideAgentService.scope === AideAgentScope.Selection) {
				placeholder += (this.anchoredContext.length > 0 ? this.anchoredContext : 'the selected range');
			} else if (this.aideAgentService.scope === AideAgentScope.PinnedContext) {
				placeholder += 'the pinned context';
			} else {
				placeholder += 'the whole codebase';
			}

			if (!this.inputHasFocus.get()) {
				const keybinding = this.keybindingService.lookupKeybinding('workbench.action.aideAgent.focus');
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

		const toolbarWidth = this.toolbarElement?.clientWidth ?? 0;
		this._input.layout({ width: width - 72 /* gutter */ - 14 /* scrollbar */ - toolbarWidth, height: height });
	}
}
