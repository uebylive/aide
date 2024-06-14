/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clearNode, h } from 'vs/base/browser/dom';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';

export class AideChatBreakdownHover extends Disposable {
	public readonly domNode: HTMLElement;
	private readonly header: HTMLElement;
	private readonly content: HTMLElement;

	private readonly markdownRenderer: MarkdownRenderer;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);

		const hoverElement = h(
			'.aide-chat-breakdown-hover@root',
			[
				h('.aide-chat-breakdown-hover-header@header'),
				h('.aide-chat-breakdown-hover-content@content')
			]
		);
		this.domNode = hoverElement.root;

		this.header = hoverElement.header;
		this.content = hoverElement.content;
	}

	setHoverContent(header: IMarkdownString, content: IMarkdownString): void {
		clearNode(this.header);
		clearNode(this.content);

		this.header.appendChild(this.markdownRenderer.render(header).element);
		this.content.appendChild(this.markdownRenderer.render(content).element);
	}
}
