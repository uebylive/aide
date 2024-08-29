/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode, hide, show } from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/aideControls';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { SymbolKinds } from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colors/inputColors';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { getWorkbenchContribution } from 'vs/workbench/common/contributions';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { ContextPicker } from 'vs/workbench/contrib/aideProbe/browser/aideContextPicker';
import { IAideLSPService, unsupportedLanguages } from 'vs/workbench/contrib/aideProbe/browser/aideLSPService';
import { showProbeView } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { CONTEXT_PROBE_ARE_CONTROLS_ACTIVE, CONTEXT_PROBE_HAS_SELECTION, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT, CONTEXT_PROBE_MODE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeModel, IVariableEntry } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeMode, AideProbeStatus, IAideProbeMode, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IParsedChatRequest } from 'vs/workbench/contrib/aideProbe/common/aideProbeParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/aideProbe/common/aideProbeRequestParser';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { OS } from 'vs/base/common/platform';
import { IDimension } from 'vs/editor/common/core/dimension';
import { IAideControlsPartService } from 'vs/workbench/services/aideControlsPart/browser/aideControlsPartService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

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
}

export class AideControlsService implements IAideControlsService {
	_serviceBrand: undefined;
	private _controls: AideControls | undefined;

	get controls() {
		return this._controls;
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

const exitAnchoredEditingCommand = 'workbench.action.aideProbe.exitAnchoredEditing';
const enterAnchoredEditingCommand = 'workbench.action.aideProbe.enterAnchoredEditing';
const enterAgenticEditingCommand = 'workbench.action.aideProbe.enterAgenticEditing';

export class AideControls extends Themable implements IAideControls {

	public static readonly ID = 'workbench.contrib.aideControls';

	// TODO(@g-danna): Make sure we get the right part in the auxilliary editor, not just the main one
	private part = this.aideControlsPartService.mainPart;
	private element: HTMLElement;

	private probeModeHeaderElement: HTMLElement;
	private anchoredModeSymbolElement: HTMLElement;


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

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;
	private resourceLabels: ResourceLabels | undefined;
	private anchoredSymbolLabels: IResourceLabel[] = [];
	private anchoredSymbols: { resource: URI; name: string }[] = [];

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
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
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

		const element = this.element = $('.aide-controls');
		this.part.content.appendChild(element);
		element.style.backgroundColor = this.theme.getColor(SIDE_BAR_BACKGROUND)?.toString() || '';


		const anchoredSymbolElement = $('.aide-controls-anchored-symbol');
		element.appendChild(anchoredSymbolElement);
		const button = this.instantiationService.createInstance(Button, anchoredSymbolElement, { title: 'Removed anchored symbol selection' });
		this._register(button.onDidClick(() => {
			if (this.aideProbeService.anchorEditingSelection && this.probeMode.get() === AideProbeMode.ANCHORED) {
				this.commandService.executeCommand(exitAnchoredEditingCommand);
			} else if (!this.aideProbeService.anchorEditingSelection && this.probeMode.get() === AideProbeMode.ANCHORED) {
				this.commandService.executeCommand(enterAnchoredEditingCommand);
			} else {
				this.commandService.executeCommand(enterAgenticEditingCommand);
			}

		}));

		this.probeModeHeaderElement = this.createProbeModeHeaderElement(button);
		this.anchoredModeSymbolElement = this.createAnchoredSymbolsElement(button);

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

		this.contextPicker = getWorkbenchContribution<ContextPicker>(ContextPicker.ID);
		this.contextPicker.append(inputElement);

		this.createToolbar(toolbarElement);

		this.checkActivation();
		this.updateInputPlaceholder();
		this.checkEditorSelection();

		this._register(this.aideLSPService.onDidChangeStatus(() => {
			this.updateInputPlaceholder();
			this.checkActivation();
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.updateInputPlaceholder();
			this.checkActivation();
			this.checkEditorSelection();
		}));

		this.updateProbeModeDisplay();


		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_PROBE_MODE.key]))) {
				this.updateProbeModeDisplay();
			}
		}));

		this._register(this.aideProbeService.onDidSetAnchoredSelection((event) => {
			const filesInContext = Array.from(this.contextPicker.context.entries).filter(entry => entry.isFile) as unknown as { resource: URI }[];
			const newContext = filesInContext.map(entry => entry.resource.fsPath);
			const anchoredSelectionFile = event?.uri.fsPath;
			if (anchoredSelectionFile) {
				newContext.push(anchoredSelectionFile);
			}

			if (this.probeStatus.get() !== AideProbeStatus.IN_PROGRESS) {
				this.aideProbeService.onContextChange(newContext);
			}

			this.updateProbeModeDisplay();
			if (this.part.dimension) {
				const { width, height } = this.part.dimension;
				this.layout(width, height);
			}
		}));


		this.probeStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);
		this.probeStatus.set(AideProbeStatus.INACTIVE);
	}

	private createProbeModeHeaderElement(button: Button) {
		const headerElement = this.probeModeHeaderElement = $('.aide-controls-probe-mode-header');
		button.element.appendChild(headerElement);
		const modeElement = $('span.aide-controls-probe-mode');
		headerElement.appendChild(modeElement);
		const keybindingElement = $('span.aide-controls-probe-mode-keybinding');
		headerElement.appendChild(keybindingElement);
		hide(headerElement);
		return headerElement;
	}

	private createAnchoredSymbolsElement(button: Button) {
		const anchoredSymbolsElement = this.anchoredModeSymbolElement = $('.aide-controls-anchored-symbol-button');
		button.element.appendChild(anchoredSymbolsElement);
		const symbolsElement = $('span.aide-controls-anchored-symbol-symbols');
		anchoredSymbolsElement.appendChild(symbolsElement);
		const uriElement = $('span.aide-controls-anchored-symbol-uri');
		anchoredSymbolsElement.appendChild(uriElement);
		hide(anchoredSymbolsElement);
		return anchoredSymbolsElement;
	}

	private updateAnchoredSymbolsButton(container: HTMLElement) {
		const resourceLabels = this.resourceLabels;
		const anchorEditingSelection = this.aideProbeService.anchorEditingSelection;
		if (!resourceLabels || !anchorEditingSelection) {
			return;
		}

		const uri = anchorEditingSelection.uri;
		anchorEditingSelection?.symbols.forEach(symbol => {
			if (
				this.anchoredSymbols.some(
					anchoredSymbol => anchoredSymbol.resource.toString() === uri.toString() && anchoredSymbol.name === symbol.name
				)
			) {
				return;
			} else if (this.anchoredSymbols.length === 0) {
				const clearButton = this._register(new Button(container, { supportIcons: true }));
				clearButton.icon = Codicon.close;
				this._register(clearButton.onDidClick(() => {
					if (this.probeMode.get() === AideProbeMode.ANCHORED) {
						clearNode(container);
						this.anchoredSymbols = [];
						this.anchoredSymbolLabels.forEach(label => label.dispose());
						this.anchoredSymbolLabels = [];
						this.commandService.executeCommand('workbench.action.aideProbe.exitAnchoredEditing');
					}
				}));
			}

			const symbolLabel = resourceLabels.create(container, { supportHighlights: true });
			symbolLabel.setResource({ resource: uri, name: symbol.name, description: basenameOrAuthority(uri) }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(symbol.kind),
			});
			this.anchoredSymbols.push({ resource: uri, name: symbol.name });
			this.anchoredSymbolLabels.push(symbolLabel);
		});
	}


	private updateProbeModeDisplay() {
		const anchorEditingSelection = this.aideProbeService.anchorEditingSelection;

		if (this.probeMode.get() === AideProbeMode.AGENTIC) {
			this.updateProbeHeader(this.probeHasSelection.get() || false);
		} else if (this.probeMode.get() === AideProbeMode.ANCHORED && anchorEditingSelection) {
			this.updateAnchoredSymbolsButton(this.anchoredModeSymbolElement);
			hide(this.probeModeHeaderElement);
			show(this.anchoredModeSymbolElement);
		}
	}



	private updateProbeHeader(showEnterAnchored: boolean) {
		hide(this.anchoredModeSymbolElement);
		show(this.probeModeHeaderElement);
		const kbElement = this.updateHeaderKeybinding(showEnterAnchored ? enterAnchoredEditingCommand : enterAgenticEditingCommand);
		this.probeModeHeaderElement.querySelector('.aide-controls-probe-mode')!.textContent = `${showEnterAnchored ? 'Enter anchored' : 'Agentic'} editig`;
		const kbContainer = this.probeModeHeaderElement.querySelector('.aide-controls-probe-mode-keybinding') as HTMLElement;
		clearNode(kbContainer);
		if (kbElement) {
			kbContainer.appendChild(kbElement);
		}
	}

	private updateHeaderKeybinding(actionId: string) {
		const kb = this.keybindingService.lookupKeybinding(actionId, this.contextKeyService);
		if (kb) {
			const k = this._register(new KeybindingLabel($('div'), OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
			k.set(kb);
			return k.element;
		}
		return undefined;
	}

	private checkEditorSelection() {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor)) {
			this.activeEditorDisposables.add(activeEditor.onDidChangeCursorSelection((event) => {
				const isValid = event.selection !== null && !event.selection.isEmpty();
				this.probeHasSelection.set(isValid);
				this.updateProbeModeDisplay();
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
		if (!currentSession) {
			let variables: IVariableEntry[] = [];
			if (this.contextPicker) {
				variables = Array.from(this.contextPicker.context.entries);
			}
			this.model = this.aideProbeService.startSession();
			this.aideProbeService.initiateProbe(this.model, editorValue, variables, activeEditor.getModel());
		} else {
			this.aideProbeService.addIteration(editorValue);
		}
		showProbeView(this.viewsService);
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

	layout(width: number, height: number) {
		const newWidth = Math.min(width, MAX_WIDTH);
		this.element.style.width = `${newWidth}px`;
		this._input.layout({ width: newWidth - 60 - 16, height: height - 6 - 32 - 42 });

	}
}
