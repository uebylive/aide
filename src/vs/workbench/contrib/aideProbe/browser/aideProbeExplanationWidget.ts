/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { SidePanelWidget } from 'vs/editor/contrib/sidePanel/browser/sidePanelWidget';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

const $ = dom.$;

export class AideProbeExplanationWidget extends SidePanelWidget {
	private breakdownContent: IAideProbeBreakdownViewModel | undefined;

	constructor(
		editor: ICodeEditor,
		private readonly markdownRenderer: MarkdownRenderer
	) {
		super(editor);
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

	updateBreakdown(content: IAideProbeBreakdownViewModel): void {
		this.breakdownContent = content;
		super.show();
	}

	protected override _fillContainer(container: HTMLElement): void {
		if (!this.breakdownContent) {
			return;
		}

		const contentDiv = this.renderExplanation(this.breakdownContent);
		container.append(contentDiv);
	}
}
