/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { SashState } from 'vs/base/browser/ui/sash/sash';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AideControlsPart } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';
import { AideControlsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideControlsPanel';
import { AideEditsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideEditsPanel';
import { IAideLSPService, unsupportedLanguages } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { AideProbeViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IAideControlsService } from 'vs/workbench/services/aideControls/browser/aideControlsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import 'vs/css!./media/aideControls';
//import { ContextPicker } from 'vs/workbench/contrib/aideProbe/browser/aideContextPicker';

const INPUT_MIN_HEIGHT = 36;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

export class AideControls extends Disposable {

	static readonly ID = 'workbench.contrib.aideControls';
	private static readonly INPUT_URI = URI.parse('aideControls:input');

	private margin = 14;
	private panelHeight = 400 - this.margin * 2;
	private inputHeight = INPUT_MIN_HEIGHT;

	private part: AideControlsPart;
	private input: CodeEditorWidget;
	private panel: AideControlsPanel | undefined;

	private inputHasText: IContextKey<boolean>;
	private requestStatus: IContextKey<AideProbeStatus>;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideProbeViewModel | undefined;
	private set viewModel(viewModel: AideProbeViewModel | undefined) {
		// @willisCheck: I edited this
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		if (viewModel === undefined) {
			this._viewModel?.dispose();
			this._viewModel = undefined;
		} else {
			this._viewModel = viewModel;
			this.viewModelDisposables.add(viewModel);
		}
	}

	get viewModel(): AideProbeViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		@IAideControlsService aideControlsService: IAideControlsService,
		@IAideLSPService private readonly aideLSPService: IAideLSPService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,

	) {

		super();

		this.inputHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.requestStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);

		// @willisTODO: Make sure we get the right part in the auxilliary editor, not just the main one
		this.part = aideControlsService.mainPart;

		const element = $('.aide-controls');
		element.style.margin = `${this.margin}px`;
		this.part.element.appendChild(element);

		//const contextSelectElement = $('.aide-controls-select');
		//element.appendChild(contextSelectElement);
		//this.createQuickContextSelect(contextSelectElement);

		this.panel = instantiationService.createInstance(AideEditsPanel, element);

		this.input = this.createInput(element);


		this.layout();

		this._register(this.panel.onDidResize(({ newHeight }) => {
			if (this.panel) {
				const minHeight = this.part.minimumHeight - this.inputHeight;
				this.panelHeight = Math.max(minHeight, newHeight);
			}
			this.layout();
		}));
	}

	createInput(parent: HTMLElement) {
		const editorOuterElement = $('.aide-controls-input');
		parent.appendChild(editorOuterElement);
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(editorOuterElement));

		const editorElement = $('.aide-controls-input-editor');
		editorOuterElement.appendChild(editorElement);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));
		const defaultOptions = getSimpleEditorOptions(this.configurationService);
		const options: IEditorConstructionOptions = {
			...defaultOptions,
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
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([HoverController.ID]));
		const editor = this.input = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, options, editorOptions));
		let editorModel = this.modelService.getModel(AideControls.INPUT_URI);
		if (!editorModel) {
			editorModel = this.modelService.createModel('', null, AideControls.INPUT_URI, true);
			this._register(editorModel);
		}
		editor.setModel(editorModel);
		editor.render();

		this.codeEditorService.registerDecorationType(inputPlaceholder.description, inputPlaceholder.decorationType, {});
		this.updateInputPlaceholder();

		this._register(editor.onDidChangeModelContent(() => {
			const currentHeight = Math.max(editor.getContentHeight(), INPUT_MIN_HEIGHT);

			if (this.requestStatus.get() !== AideProbeStatus.INACTIVE && this._viewModel) {
				const inputValue = editor.getValue();
				this._viewModel.setFilter(inputValue);
				// @willisTODO set is filtered on panel (?)
			}

			const model = editor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			editorElement.classList.toggle('has-text', inputHasText);
			this.inputHasText.set(inputHasText);
			this.updateInputPlaceholder();


			if (currentHeight !== this.inputHeight) {
				this.inputHeight = currentHeight;
			}
			this.layout();
		}));

		this._register(this.aideLSPService.onDidChangeStatus(() => {
			this.updateInputPlaceholder();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateInputPlaceholder();
		}));

		return editor;
	}



	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {
			const theme = this.themeService.getColorTheme();
			const transparentForeground = theme.getColor(inputPlaceholderForeground);


			let placeholder;
			if (this.requestStatus.get() !== 'INACTIVE') {
				placeholder = 'Filter through the results';
			} else {
				placeholder = 'Start a task';
			}

			const editor = this.editorService.activeTextEditorControl;
			if (editor && isCodeEditor(editor)) {
				const model = editor.getModel();
				if (!model) {
					placeholder = 'Open a file to start using Aide';
				} else {
					const languageId = model.getLanguageId();
					// @willisTODO - make or find a capitalize util
					const capitalizedLanguageId = languageId.charAt(0).toUpperCase() + languageId.slice(1);

					if (unsupportedLanguages.has(languageId)) {
						placeholder = `Aide doesn't support ${capitalizedLanguageId}`;
					} else {
						const isLSPActive = this.aideLSPService.getStatus(languageId);
						if (!isLSPActive) {
							placeholder = `Loading language server for ${capitalizedLanguageId}...`;
						}
					}
				}
			}

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
			this.input.setDecorationsByType(inputPlaceholder.description, inputPlaceholder.decorationType, decorationOptions);
		} else {
			this.input.removeDecorationsByType(inputPlaceholder.decorationType);
		}
	}

	layout() {
		this.part.layout(this.part.availableWidth, this.inputHeight);
		const width = this.part.width - this.margin * 2;
		this.input.layout({ height: this.inputHeight, width });

		if (this.panel) {
			this.part.layout(this.part.availableWidth, this.panelHeight + this.inputHeight + this.margin * 2);
			this.panel.layout(this.panelHeight, width);
			if (this.part.height <= this.part.minimumHeight) {
				this.panel.sash.state = SashState.AtMaximum;
				return;
			}
			this.panel.sash.state = SashState.Enabled;
		}
	}
}
