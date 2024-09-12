/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { IAideProbeBreakdownViewModel, IAideProbeInitialSymbolsViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

export const IAideProbeExplanationService = createDecorator<IAideProbeExplanationService>('IAideProbeExplanationService');

export interface IAideProbeExplanationService {
	_serviceBrand: undefined;

	changeActiveBreakdown(content: IAideProbeBreakdownViewModel): void;
	displayInitialSymbol(content: IAideProbeInitialSymbolsViewModel): void;
	clear(): void;
}

export class AideProbeExplanationService extends Disposable implements IAideProbeExplanationService {
	declare _serviceBrand: undefined;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	// private readonly markdownRenderer: MarkdownRenderer;
	// private readonly resourceLabels: ResourceLabels;

	private explanationWidget: AideProbeExplanationWidget | undefined;

	constructor(
		// @IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		// @IAideProbeService private readonly aideProbeService: IAideProbeService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService
	) {
		super();

		// this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		// this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
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
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();

		/*
		let codeEditor: ICodeEditor | null;
		let breakdownPosition: Position = new Position(1, 1);
		if (editMode) {
			if (element.edits.length > 0) {
				const ranges = element.edits[0].getRangesN();
				if (ranges.length > 0) {
					const wholeRange = ranges[0];
					breakdownPosition = new Position(wholeRange.startLineNumber - 1, wholeRange.startColumn);
					codeEditor = await this.openCodeEditor(uri, wholeRange);
				}
				codeEditor = await this.openCodeEditor(uri);
			} else {
				const symbol = await element.symbol;
				codeEditor = await this.openCodeEditor(uri, symbol?.range);
			}
		} else {
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
		*/
	}


	async displayInitialSymbol(element: IAideProbeInitialSymbolsViewModel) {
		let textModel = this.modelService.getModel(element.uri);
		if (!textModel) {
			const ref = await this.textModelService.createModelReference(element.uri);
			textModel = ref.object.textEditorModel;
			ref.dispose();
		}

		const outlineModel = await this.outlineModelService.getOrCreate(textModel, CancellationToken.None);
		const symbols = outlineModel.asListOfDocumentSymbols();
		const symbol = symbols.find(symbol => symbol.name === element.symbolName);

		if (!symbol) {
			await this.openCodeEditor(element.uri);
		} else {
			await this.openCodeEditor(element.uri, symbol.range);
		}
	}

	clear(): void {
		this.explanationWidget?.clear();
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();
	}
}
