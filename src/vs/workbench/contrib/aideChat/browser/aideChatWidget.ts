/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAideChatWidget } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { AideChatInputPart } from 'vs/workbench/contrib/aideChat/browser/aideChatInputPart';
import { AideChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatOptions';
import { IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { AideChatViewModel } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';

const $ = dom.$;

export interface IAideChatViewState {
	inputValue?: string;
}

export interface IAideChatWidgetStyles {
	listForeground: string;
	listBackground: string;
	inputEditorBackground: string;
	resultEditorBackground: string;
}

export interface IAideChatWidgetViewOptions {
	editorOverflowWidgetsDomNode?: HTMLElement;
}

export class AideChatWidget extends Disposable implements IAideChatWidget {
	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private readonly _onDidChangeContentHeight = new Emitter<void>();
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private editorOptions!: AideChatEditorOptions;

	private inputPart!: AideChatInputPart;

	private container!: HTMLElement;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;

	private _visible = false;
	public get visible() {
		return this._visible;
	}

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideChatViewModel | undefined;
	private set viewModel(viewModel: AideChatViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	constructor(
		protected readonly viewOptions: IAideChatWidgetViewOptions,
		protected readonly styles: IAideChatWidgetStyles,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService protected readonly themeService: IThemeService
	) {
		super();
	}

	get input(): AideChatInputPart {
		return this.inputPart;
	}

	get inputEditor(): ICodeEditor {
		return this.inputPart.inputEditor;
	}

	get inputUri(): URI {
		return this.inputPart.inputUri;
	}

	render(parent: HTMLElement): void {
		this.editorOptions = this._register(this.instantiationService.createInstance(AideChatEditorOptions, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));

		this.container = dom.append(parent, $('.aide-chat'));
		this.createInput(this.container);

		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();
	}

	focusInput(): void {
		this.inputPart.focus();
	}

	hasInputFocus(): boolean {
		return this.inputPart.hasFocus();
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.visibleChangeCount++;
	}

	private createInput(container: HTMLElement): void {
		this.inputPart = this._register(this.instantiationService.createInstance(AideChatInputPart,
			{
				editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
			}
		));
		this.inputPart.render(container, '', this);
		this._register(this.inputPart.onDidFocus(() => this._onDidFocus.fire()));
		this._register(this.inputPart.onDidChangeHeight(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
			this._onDidChangeContentHeight.fire();
		}));
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
		this.container.style.setProperty('--vscode-interactive-session-foreground', this.editorOptions.configuration.foreground?.toString() ?? '');
		this.container.style.setProperty('--vscode-chat-list-background', this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? '');
	}

	setModel(model: IAideChatModel, viewState: IAideChatViewState): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 850);
		this.bodyDimension = new dom.Dimension(width, height);

		this.inputPart.layout(height, width);
	}
}
