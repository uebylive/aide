/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { autorun, IObservable, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { SidePanelWidget } from 'vs/editor/contrib/sidePanel/browser/sidePanelWidget';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

const $ = dom.$;

export class AideProbeExplanationWidget extends SidePanelWidget {
	private breakdowns: { vm: IAideProbeBreakdownViewModel; position?: number }[] = [];
	private readonly _scrollTop: IObservable<number>;

	constructor(
		parentEditor: ICodeEditor,
		private readonly markdownRenderer: MarkdownRenderer
	) {
		super(parentEditor);

		this._scrollTop = observableFromEvent(this.editor.onDidScrollChange, () => /** @description editor.getScrollTop */ this.editor.getScrollTop());
		this._register(autorun(reader => {
			/** @description update padding top when editor scroll changes */
			const newScrollTop = this._scrollTop.read(reader);
			console.log('update padding top when editor scroll changes');
			console.log(newScrollTop);
			console.log(this.editor.getLayoutInfo().height);
		}));
	}

	private renderExplanation(element: IAideProbeBreakdownViewModel) {
		const container = $('div.breakdown-content');
		const { query, response } = element;
		if (response) {
			const body = $('div.breakdown-body');
			const renderedContent = this.markdownRenderer.render(response);
			body.appendChild(renderedContent.element);
			container.appendChild(body);
		} else if (query) {
			const header = $('div.breakdown-header');
			const renderedContent = this.markdownRenderer.render(query);
			header.appendChild(renderedContent.element);
			container.appendChild(header);
		}
		return container;
	}

	setBreakdown(content: IAideProbeBreakdownViewModel): void {
		const existingBreakdown = this.breakdowns.find(b => b.vm.name === content.name && b.vm.uri === content.uri);
		if (existingBreakdown) {
			existingBreakdown.vm = content;
		} else {
			this.breakdowns.push({ vm: content });
		}
	}

	clearBreakdowns(): void {
		this.breakdowns = [];
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
			container.append(contentDiv);
		}
	}
}
