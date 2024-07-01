/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { DocumentSymbol, SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { SidePanelWidget } from 'vs/editor/contrib/sidePanel/browser/sidePanelWidget';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { symbolDecorationLineOptions } from 'vs/workbench/contrib/aideProbe/browser/contrib/aideProbeDecorations';

const $ = dom.$;

export class AideProbeExplanationWidget extends SidePanelWidget {
	private breakdowns: { vm: IAideProbeBreakdownViewModel; position?: number }[] = [];

	private _symbolResolver: (() => Promise<DocumentSymbol[] | undefined>) | undefined;
	private symbols: DocumentSymbol[] | undefined;

	private readonly _probingSymbolDecorations: IEditorDecorationsCollection;

	constructor(
		parentEditor: ICodeEditor,
		private readonly resourceLabels: ResourceLabels,
		private readonly markdownRenderer: MarkdownRenderer,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService
	) {
		super(parentEditor);

		this._symbolResolver = async () => {
			this.symbols = await this.resolveSymbol();
			return this.symbols;
		};
		this._symbolResolver();

		this._probingSymbolDecorations = this.editor.createDecorationsCollection();
	}

	async resolveSymbol(): Promise<DocumentSymbol[] | undefined> {
		try {
			const model = this.editor.getModel();
			if (!model) {
				return;
			}

			return (await this.outlineModelService.getOrCreate(model, CancellationToken.None)).getTopLevelSymbols();
		} catch (e) {
			return;
		}
	}

	private renderExplanation(element: IAideProbeBreakdownViewModel) {
		const container = $('div.breakdown-content');
		const { name, query, response } = element;

		const rowResource = $('div.breakdown-resource');
		const label = this._register(this.resourceLabels.create(rowResource, { supportHighlights: true }));
		label.element.style.display = 'flex';
		label.setResource({ name }, { icon: SymbolKinds.toIcon(SymbolKind.Method) });
		container.appendChild(rowResource);

		element.symbol.then(symbol => {
			if (symbol && symbol.kind) {
				label.setResource({ name }, { icon: SymbolKinds.toIcon(symbol.kind) });
			}
		});

		if (query) {
			const header = $('div.breakdown-header');
			const circleIcon = Codicon.circleFilled.id;
			const markdown = new MarkdownString(`$(${circleIcon}) ${query.value}`, { supportThemeIcons: true });
			const renderedContent = this.markdownRenderer.render(markdown);
			header.appendChild(renderedContent.element);
			container.appendChild(header);
		}

		if (response) {
			const body = $('div.breakdown-body');
			const renderedContent = this.markdownRenderer.render(response);
			body.appendChild(renderedContent.element);
			container.appendChild(body);
		}

		return container;
	}

	private async getOffset(content: IAideProbeBreakdownViewModel): Promise<number> {
		if (!this.symbols && this._symbolResolver) {
			this.symbols = await this._symbolResolver();
		}

		const symbol = this.symbols?.find(s => s.name === content.name);
		return this.editor.getTopForLineNumber(symbol?.selectionRange.startLineNumber ?? 0);
	}

	async setBreakdown(content: IAideProbeBreakdownViewModel): Promise<void> {
		let existingBreakdown = this.breakdowns.find(b => b.vm.name === content.name && b.vm.uri === content.uri);
		if (existingBreakdown) {
			existingBreakdown = {
				...existingBreakdown,
				vm: content,
				position: await this.getOffset(content)
			};
		} else {
			this.breakdowns.push({
				vm: content,
				position: await this.getOffset(content)
			});
		}
	}

	showProbingSymbols(symbol: DocumentSymbol) {
		const lineRange = new Range(
			symbol.range.startLineNumber, 1,
			symbol.range.startLineNumber, Number.MAX_VALUE
		);
		this._probingSymbolDecorations.append([{ range: lineRange, options: symbolDecorationLineOptions }]);
	}

	clear(): void {
		this.breakdowns = [];
		this._probingSymbolDecorations.clear();
	}

	override show(): void {
		super.show();
	}

	override hide(): void {
		super.hide();
	}

	protected override _fillContainer(container: HTMLElement): void {
		if (!this.breakdowns.length) {
			return;
		}

		for (const breakdown of this.breakdowns) {
			const contentDiv = this.renderExplanation(breakdown.vm);
			contentDiv.style.top = `${breakdown.position}px`;
			container.append(contentDiv);
		}
	}
}
