/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
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
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IAideLSPService, unsupportedLanguages } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAideControlsPartService } from 'vs/workbench/services/aideControlsPart/browser/aideControlsPartService';
import 'vs/css!./media/aideControls';
import { ContextPicker } from 'vs/workbench/contrib/aideProbe/browser/aideContextPicker';
import { Heroicon } from 'vs/workbench/browser/heroicon';
import { Button } from 'vs/base/browser/ui/button/button';
import { AideProbeStatus, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';


const MAX_WIDTH = 800;
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


export class AideControls extends Themable {

	public static readonly ID = 'workbench.contrib.aideControls';

	// TODO(@g-danna): Make sure we get the right part in the auxilliary editor, not just the main one
	private part = this.aideControlsPartService.mainPart;
	private element: HTMLElement;

	private _input: CodeEditorWidget;
	private inputHeight = INPUT_MIN_HEIGHT;
	private static readonly INPUT_URI = URI.parse('aideControls:input');

	private submitButton: Button;
	private submitButtonIcon: Heroicon | undefined;
	private contextPicker: ContextPicker;


	private inputHasText: IContextKey<boolean>;
	private inputHasFocus: IContextKey<boolean>;
	private probeStatus: IContextKey<IAideProbeStatus>;

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
		@IThemeService themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,
	) {

		super(themeService);
		this.themeService = themeService;

		aideControlsService.registerControls(this);

		this.inputHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);
		this.probeStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);

		const element = this.element = $('.aide-controls');
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';

		this.part.content.appendChild(element);

		this._input = this.createInput(element);

		this._input.onDidChangeModelContent(() => {
			if (this._input.getValue().trim().length === 0) {
				this.aideProbeService.rejectCodeEdits();
				return;
			}
		});

		const partSize = this.part.dimension;
		if (partSize) {
			this.layout(partSize.width, partSize.height);
		}
		this.part.onDidSizeChange((size) => {
			this.layout(size.width, size.height);
		});

		this.submitButton = new Button(element, {});
		this.submitButton.element.classList.add('aide-controls-submit-button');
		this.updateSubmitButtonIcon(this.submitButton);

		this.checkActivation();

		this.editorService.onDidActiveEditorChange(() => {
			this.checkActivation();
		});

		this.submitButton.onDidClick(() => {
			if (!this.model) {
				this._acceptInput();
			} else if (this.model.status === AideProbeStatus.IN_PROGRESS) {
				this.aideProbeService.rejectCodeEdits();
			} else {
				this._acceptInput();
				// Trigger fix the world
			}
		});

		this._register(this.contextKeyService.onDidChangeContext((event) => {
			if (event.affectsSome(new Set([CONTEXT_PROBE_REQUEST_STATUS.key]))) {
				this.updateSubmitButtonIcon(this.submitButton);
			}
		}));

		this._register(this._input.onDidFocusEditorText(() => {
			this.inputHasFocus.set(true);
		}));

		this._register(this._input.onDidBlurEditorText(() => {
			this.inputHasFocus.set(false);
		}));

		this.contextPicker = this._register(this.instantiationService.createInstance(ContextPicker, element));
	}

	private checkActivation() {
		const isLSPActive = this.aideLSPService.isActiveForCurrentEditor();
		const activeEditor = this.editorService.activeTextEditorControl;
		this.submitButton.enabled = isCodeEditor(activeEditor) && isLSPActive;
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
			this.checkActivation();
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

			this.aideProbeService.initiateProbe(this.model, editorValue, true, false, Array.from(this.contextPicker.context.entries), textModel);
		} else {
			this.aideProbeService.addIteration(editorValue);
		}
	}

	private updateSubmitButtonIcon(button: Button) {

		if (this.submitButtonIcon) {
			this.submitButtonIcon.dispose();
		}
		let iconId = 'mini/play';

		switch (this.probeStatus.get()) {
			case AideProbeStatus.IN_PROGRESS:
				iconId = 'mini/stop';
				break;
			case AideProbeStatus.INACTIVE:
				iconId = 'mini/play';
				break;
			case AideProbeStatus.IN_REVIEW:
			default:
				iconId = 'mini/play'; // Replace with cog and play
				break;
		}

		return this.submitButtonIcon = this.instantiationService.createInstance(Heroicon, button.element, iconId);
	}


	private updateInputPlaceholder() {
		if (!this.inputHasText.get()) {

			let placeholder = 'Start a task';
			const editor = this.editorService.activeTextEditorControl;
			if (!editor || (editor && isCodeEditor(editor))) {
				const model = editor?.getModel();
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
		const newWidth = Math.min(width, MAX_WIDTH);
		this.element.style.width = `${newWidth}px`;
		this._input.layout({ width: newWidth - 60 - 36 - 12, height: height - 6 });
	}
}
