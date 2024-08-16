/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { Disposable } from 'vs/base/common/lifecycle';
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
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAideLSPService, unsupportedLanguages } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { CONTEXT_PROBE_INPUT_HAS_TEXT } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeModel, AideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAideControlsPartService } from 'vs/workbench/services/aideControlsPart/browser/aideControlsPartService';
import 'vs/css!./media/aideControls';

const INPUT_MIN_HEIGHT = 36;

const inputPlaceholder = {
	description: 'aide-controls-input',
	decorationType: 'aide-controls-input-editor',
};

export const IAideControlsService = createDecorator<IAideControlsService>('IAideControlsService');

export interface IAideControlsService {
	_serviceBrand: undefined;
	registerControls(controls: AideControls): void;
	acceptInput(): void;
}

export class AideControlsService implements IAideControlsService {
	_serviceBrand: undefined;
	private controls: AideControls | undefined;

	registerControls(controls: AideControls): void {
		if (!this.controls) {
			this.controls = controls;
		} else {
			console.warn('AideControls already registered');
		}
	}

	acceptInput(): void {
		if (this.controls) {
			this.controls.acceptInput();
		}
	}
}


registerSingleton(IAideControlsService, AideControlsService, InstantiationType.Eager);


export class AideControls extends Disposable {

	public static readonly ID = 'workbench.contrib.aideControls';

	// TODO(@g-danna): Make sure we get the right part in the auxilliary editor, not just the main one
	private part = this.aideControlsPartService.mainPart;

	private _input: CodeEditorWidget;
	private inputHeight = INPUT_MIN_HEIGHT;
	private static readonly INPUT_URI = URI.parse('aideControls:input');


	private inputHasText: IContextKey<boolean>;

	private model: AideProbeModel | undefined;

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
		@IThemeService private readonly themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,
	) {

		super();

		aideControlsService.registerControls(this);

		this.inputHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);

		const element = $('.aide-controls');
		this.part.content.appendChild(element);

		this._input = this.createInput(element);


		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		this._input.onDidChangeModelContent(() => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			if (this._input.getValue().trim().length === 0) {
				this.aideProbeService.cancelProbe();
				return;
			}

			timeoutId = setTimeout(() => {
				this.acceptInput();
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
			}, 1000);
		});

		const partSize = this.part.dimension;
		if (partSize) {
			this.layout(partSize.width, partSize.height);
		}
		this.part.onDidSizeChange((size) => {
			this.layout(size.width, size.height);
		});
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
		const editor = this._input = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, editorElement, options, editorOptions));
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

			const model = editor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			editorElement.classList.toggle('has-text', inputHasText);
			this.inputHasText.set(inputHasText);
			this.updateInputPlaceholder();


			if (currentHeight !== this.inputHeight) {
				this.inputHeight = currentHeight;
			}
		}));

		this._register(this.aideLSPService.onDidChangeStatus(() => {
			this.updateInputPlaceholder();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateInputPlaceholder();
		}));


		return editor;
	}

	acceptInput() {
		return this._acceptInput();
	}

	private _acceptInput() {

		const currentSession = this.aideProbeService.getSession();
		const editorValue = this._input.getValue();
		const activeEditor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(activeEditor)) { return; }
		const textModel = activeEditor.getModel();

		const selection = activeEditor.getSelection();

		if (!selection) { return; }

		if (!currentSession) {
			this.model = this.aideProbeService.startSession();
			this.model.status = AideProbeStatus.IN_PROGRESS;
			this.aideProbeService.initiateProbe(this.model, editorValue, true, false, [{
				id: 'selection',
				name: 'selection',
				value: selection
			}], textModel);
		} else {
			this.aideProbeService.addIteration(editorValue);
		}
	}

	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {

			let placeholder = 'Start a task';
			const editor = this.editorService.activeTextEditorControl;
			if (editor && isCodeEditor(editor)) {
				const model = editor.getModel();
				if (!model) {
					placeholder = 'Open a file to start using Aide';
				} else {
					const languageId = model.getLanguageId();
					// TODO(@g-danna) - make or find a capitalize util
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

	layout(width: number, height: number) {
		this._input.layout({ width, height });
	}
}
