/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as lifecycle from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

const $ = dom.$;

export class AideProbeExplanationWidget extends ZoneWidget {
	private readonly markdownRenderer: MarkdownRenderer;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		private parentEditor: ICodeEditor,
		private content: IAideProbeBreakdownViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(parentEditor, {
			showArrow: false,
			showFrame: true,
			frameWidth: 1,
			isAccessible: true,
		});

		this.toDispose = [];
		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.toDispose.push(this.markdownRenderer);

		super.create();
	}

	public setContent(content: IAideProbeBreakdownViewModel): void {
		this.content = content;
	}

	protected override _fillContainer(container: HTMLElement): void {
		const contentParent = $('.aide-probe-explanation-widget');
		const layoutInfo = this.parentEditor.getLayoutInfo();
		contentParent.style.paddingLeft = `${layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth}px`;
		container.appendChild(contentParent);
		this.renderContent(contentParent);
	}

	private renderContent(container: HTMLElement): void {
		const { query, response } = this.content;
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
	}

	override dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}

	private doDummyRender(): number {
		if (!this.domNode) {
			return 0;
		}

		const dummyParent = $('.aide-probe-explanation-widget-dummy');
		this.domNode.appendChild(dummyParent);

		this.renderContent(dummyParent);
		const height = dom.getContentHeight(dummyParent);
		this.domNode.removeChild(dummyParent);

		return Math.ceil(height / 22);
	}

	override show(rangeOrPos: IRange | IPosition): void {
		super.show(rangeOrPos, 1);
		const lines = this.doDummyRender();
		super.hide();
		super.show(rangeOrPos, lines + 2);
	}
}
