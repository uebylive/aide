/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ITextEditorOptions, TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

// const decorationDescription = 'chat-breakdown-definition';
// const placeholderDecorationType = 'chat-breakdown-definition-session-detail';

export const IAideProbeExplanationService = createDecorator<IAideProbeExplanationService>('IAideProbeExplanationService');

export interface IAideProbeExplanationService {
	_serviceBrand: undefined;

	changeActiveBreakdown(content: IAideProbeBreakdownViewModel): void;
	clearBreakdowns(): void;
}

export class AideProbeExplanationService extends Disposable implements IAideProbeExplanationService {
	declare _serviceBrand: undefined;

	private readonly markdownRenderer: MarkdownRenderer;
	private explanationWidget: AideProbeExplanationWidget | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
	}

	private openCodeEditor(uri: URI, selection?: IRange): Promise<ICodeEditor | null> {
		let options: ITextEditorOptions = {
			pinned: false,
			preserveFocus: true
		};

		if (selection) {
			options = {
				...options,
				selection,
				selectionRevealType: TextEditorSelectionRevealType.NearTop
			};
		}

		return this.codeEditorService.openCodeEditor({ resource: uri, options }, null);
	}

	async changeActiveBreakdown(element: IAideProbeBreakdownViewModel): Promise<void> {
		const { uri } = element;
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();

		let codeEditor: ICodeEditor | null;
		let breakdownPosition: Position = new Position(1, 300);

		const resolveLocationOperation = element.symbol;
		// this.editorProgressService.showWhile(resolveLocationOperation);
		const symbol = await resolveLocationOperation;

		if (!symbol) {
			codeEditor = await this.openCodeEditor(uri);
		} else {
			breakdownPosition = new Position(symbol.range.startLineNumber - 1, symbol.range.startColumn);
			codeEditor = await this.openCodeEditor(uri, symbol.range);
		}

		if (codeEditor && symbol && breakdownPosition) {
			this.explanationWidget = this._register(this.instantiationService.createInstance(AideProbeExplanationWidget, codeEditor, this.markdownRenderer));
			this.explanationWidget.setBreakdown(element);
			this.explanationWidget.show();

			// we have the go-to-definitions, we want to highlight only on the file we are currently opening in the probebreakdownviewmodel
			// const definitionsToHighlight = this.goToDefinitionDecorations.filter((definition) => {
			// 	return definition.uri.fsPath === element.uri.fsPath;
			// })
			// 	.map((definition) => {
			// 		return {
			// 			range: {
			// 				startLineNumber: definition.range.startLineNumber,
			// 				startColumn: definition.range.startColumn,
			// 				endColumn: definition.range.endColumn + 1,
			// 				endLineNumber: definition.range.endLineNumber
			// 			},
			// 			hoverMessage: { value: definition.thinking },
			// 		};
			// 	});

			// codeEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, definitionsToHighlight);
		}
	}

	clearBreakdowns(): void {
		this.explanationWidget?.clearBreakdowns();
	}
}
