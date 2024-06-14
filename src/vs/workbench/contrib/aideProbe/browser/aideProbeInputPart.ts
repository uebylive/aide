/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DEFAULT_FONT_FAMILY } from 'vs/base/browser/fonts';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Emitter } from 'vs/base/common/event';
import { HistoryNavigator } from 'vs/base/common/history';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IPosition } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { CONTEXT_IN_PROBE_INPUT, CONTEXT_PROBE_INPUT_HAS_FOCUS, CONTEXT_PROBE_INPUT_HAS_TEXT } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 100;

export interface IAideProbeHistoryEntry {
	text: string;
}

export class AideProbeInputPart extends Disposable implements IHistoryNavigationWidget {
	static readonly INPUT_SCHEME = 'aideProbeInput';

	private _onDidLoadInputState = this._register(new Emitter<string>());
	readonly onDidLoadInputState = this._onDidLoadInputState.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator<IAideProbeHistoryEntry>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private onHistoryEntry = false;
	private inHistoryNavigation = false;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;

	readonly inputUri = URI.parse(`${AideProbeInputPart.INPUT_SCHEME}:input`);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();

		this.inputEditorHasText = CONTEXT_PROBE_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_PROBE_INPUT_HAS_FOCUS.bindTo(contextKeyService);

		this.history = new HistoryNavigator([], 5);
	}

	get element(): HTMLElement {
		return this.container;
	}

	showPreviousValue(): void {
		this.navigateHistory(true);
	}

	showNextValue(): void {
		this.navigateHistory(true);
	}

	private navigateHistory(previous: boolean): void {
		const historyEntry = (previous ?
			(this.history.previous() ?? this.history.first()) : this.history.next())
			?? { text: '' };

		this.onHistoryEntry = previous || this.history.current() !== null;

		aria.status(historyEntry.text);

		this.inHistoryNavigation = true;
		this.setValue(historyEntry.text);
		this.inHistoryNavigation = false;

		this._onDidLoadInputState.fire(historyEntry.text);
		if (previous) {
			this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			this._inputEditor.setPosition(getLastPosition(model));
		}
	}

	setValue(value: string): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		this.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
	}

	focus() {
		this._inputEditor.focus();
	}

	hasFocus(): boolean {
		return this._inputEditor.hasWidgetFocus();
	}

	render(container: HTMLElement) {
		this.container = dom.append(container, $('.aide-probe-input-part'));
		const inputContainer = dom.append(this.container, $('.aide-probe-input-container'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_PROBE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;

		const options: IEditorConstructionOptions = getSimpleEditorOptions(this.configurationService);
		options.readOnly = false;
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 8 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		options.suggest = {
			showIcons: false,
			showSnippets: false,
			showWords: true,
			showStatusBar: false,
			insertMode: 'replace',
		};
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };

		this._inputEditorElement = dom.append(inputContainer, $('.probe-input-editor'));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));
		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			// Only allow history navigation when the input is empty.
			// (If this model change happened as a result of a history navigation, this is canceled out by a call in this.navigateHistory)
			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this.inputEditorHasText.set(inputHasText);

			// If the user is typing on a history entry, then reset the onHistoryEntry flag so that history navigation can be disabled
			if (!this.inHistoryNavigation) {
				this.onHistoryEntry = false;
			}

			if (!this.onHistoryEntry) {
				this.historyNavigationForewardsEnablement.set(!inputHasText);
				this.historyNavigationBackwardsEnablement.set(!inputHasText);
			}
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this.inputEditorHasFocus.set(true);
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			this.inputEditorHasFocus.set(false);
			inputContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));

		let inputModel = this.modelService.getModel(this.inputUri);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, this.inputUri, true);
			this._register(inputModel);
		}

		this.inputModel = inputModel;
		this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
		this._inputEditor.setModel(this.inputModel);
	}

	layout(_height: number, width: number): void {
		const horizontalMargin = 12 * 2;
		const horizontalPadding = 12 * 2;
		const border = 1 * 2;

		const inputHeight = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT) - border;
		const inputWidth = width - horizontalPadding - border - horizontalMargin;

		this._inputEditor.layout(new dom.Dimension(inputWidth, inputHeight));
	}
}

function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
