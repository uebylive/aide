/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

export const IAideProbeExplanationService = createDecorator<IAideProbeExplanationService>('IAideProbeExplanationService');

export interface IAideProbeExplanationService {
	_serviceBrand: undefined;

	changeActiveBreakdown(content: IAideProbeBreakdownViewModel): void;
	clear(): void;
}

export class AideProbeExplanationService extends Disposable implements IAideProbeExplanationService {
	declare _serviceBrand: undefined;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly markdownRenderer: MarkdownRenderer;
	private readonly resourceLabels: ResourceLabels;

	private explanationWidget: AideProbeExplanationWidget | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
	}

	private async openCodeEditor(uri: URI, selection?: IRange): Promise<ICodeEditor | null> {
		const editor = await this.codeEditorService.openCodeEditor({
			resource: uri,
			options: { pinned: false, preserveFocus: true }
		}, null);

		if (editor && selection) {
			editor.revealLineNearTop(selection.startLineNumber || 1, ScrollType.Smooth);
		}

		return editor;
	}

	async changeActiveBreakdown(element: IAideProbeBreakdownViewModel): Promise<void> {
		const { uri } = element;
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();

		let codeEditor: ICodeEditor | null;
		let breakdownPosition: Position = new Position(1, 300);

		const symbol = await element.symbol;
		if (!symbol) {
			codeEditor = await this.openCodeEditor(uri);
		} else {
			breakdownPosition = new Position(symbol.range.startLineNumber - 1, symbol.range.startColumn);
			codeEditor = await this.openCodeEditor(uri, symbol.range);
		}

		if (codeEditor && symbol && breakdownPosition) {
			this.explanationWidget = this._register(this.instantiationService.createInstance(
				AideProbeExplanationWidget, codeEditor, this.resourceLabels, this.markdownRenderer
			));
			await this.explanationWidget.setBreakdown(element);
			this.explanationWidget.show();
			this.explanationWidget.showProbingSymbols(symbol);
		}
	}

	clear(): void {
		this.explanationWidget?.clear();
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();
	}
}
