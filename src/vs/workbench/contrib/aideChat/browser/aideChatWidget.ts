/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAideChatWidget } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { AideChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatOptions';
import { IAideChatModel } from 'vs/workbench/contrib/aideChat/common/aideChatModel';

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

export class AideChatWidget extends Disposable implements IAideChatWidget {
	private editorOptions!: AideChatEditorOptions;

	private container!: HTMLElement;

	constructor(
		protected readonly styles: IAideChatWidgetStyles,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService protected readonly themeService: IThemeService
	) {
		super();
	}

	render(parent: HTMLElement): void {
		this.editorOptions = this._register(this.instantiationService.createInstance(AideChatEditorOptions, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));

		this.container = dom.append(parent, $('.aide-chat'));
		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();
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

	public layout(height: number, width: number): void {
		// layout
	}
}
