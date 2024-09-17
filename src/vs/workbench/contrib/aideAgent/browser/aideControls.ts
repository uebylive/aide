/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { ISelectOptionItem, SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/aideControls';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { SetAideAgentScopePinnedContext, SetAideAgentScopeSelection, SetAideAgentScopeWholeCodebase } from 'vs/workbench/contrib/aideAgent/browser/actions/aideAgentActions';
import { CONTEXT_AIDE_CONTROLS_HAS_FOCUS, CONTEXT_AIDE_CONTROLS_HAS_TEXT } from 'vs/workbench/contrib/aideAgent/browser/aideAgentContextKeys';
import { IAideControlsService } from 'vs/workbench/contrib/aideAgent/browser/aideControlsService';
import { AideAgentScope } from 'vs/workbench/contrib/aideAgent/common/aideAgentModel';
import { IAideAgentService } from 'vs/workbench/contrib/aideAgent/common/aideAgentService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IBottomBarPartService } from 'vs/workbench/services/bottomBarPart/browser/bottomBarPartService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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

	private actionsToolbar: MenuWorkbenchToolBar | undefined;

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
		const toolbarElement = $('.aide-controls-toolbar');
		element.appendChild(toolbarElement);

		this._input = this.createInput(inputElement);
		this.updateInputPlaceholder();
		this.layout();

		this.aideAgentService.startSession();

		this.createToolbar(toolbarElement);
		this.updateScope(aideAgentService.scope);

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

	private layout() {
		const partSize = this.part.dimension;
		const width = partSize?.width;
		const height = partSize?.height;
		if (!width || !height) {
			return;
		}

		const toolbarWidth = this.actionsToolbar?.getElement().clientWidth ?? 0;
		this._input.layout({ width: width - 72 /* gutter */ - 14 /* scrollbar */ - toolbarWidth, height: height });
	}
}
