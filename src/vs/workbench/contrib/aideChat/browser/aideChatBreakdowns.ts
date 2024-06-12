/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { assertAllDefined, assertIsDefined } from 'vs/base/common/types';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IAideChatBreakdownViewModel } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';

const $ = dom.$;

export class AideChatBreakdowns extends Disposable {
	private listContainer: HTMLElement | undefined;
	private list: WorkbenchList<IAideChatBreakdownViewModel> | undefined;
	private listDelegate: BreakdownsListDelegate | undefined;
	private viewModel: IAideChatBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;

	constructor(
		private readonly container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	getHTMLElement(): HTMLElement {
		return this.container;
	}

	show(): void {
		if (this.isVisible) {
			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createBreakdownsList();
		}

		// Make visible
		this.isVisible = true;
	}

	private createBreakdownsList(): void {
		// List Container
		this.listContainer = document.createElement('div');
		this.listContainer.classList.add('breakdowns-list-container');

		// Breakdown renderer
		const renderer = this.instantiationService.createInstance(BreakdownRenderer);

		// List
		const listDelegate = this.listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate, this.listContainer);
		this.list = <WorkbenchList<IAideChatBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			this.listContainer,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				horizontalScrolling: false,
			}
		);

		this.container.appendChild(this.listContainer);
	}

	updateBreakdowns(breakdowns: IAideChatBreakdownViewModel[]): void {
		const list = assertIsDefined(this.list);

		this.viewModel = breakdowns;
		list.splice(0, list.length, breakdowns);
		list.layout();
	}

	updateBreakdownHeight(breakdown: IAideChatBreakdownViewModel): void {
		const index = this.viewModel.indexOf(breakdown);
		if (index === -1) {
			return;
		}

		const [list, listDelegate] = assertAllDefined(this.list, this.listDelegate);
		list.updateElementHeight(index, listDelegate.getHeight(breakdown));
		list.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		// Hide
		this.isVisible = false;

		// Clear list
		this.list.splice(0, this.viewModel.length);

		// Clear view model
		this.viewModel = [];
	}

	layout(): void {
		if (this.list) {
			this.list.layout();
		}
	}
}

interface IBreakdownTemplateData {
	container: HTMLElement;
	toDispose: DisposableStore;
}

class BreakdownRenderer extends Disposable implements IListRenderer<IAideChatBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownsListRenderer';

	private readonly markdownRenderer: MarkdownRenderer;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
	}

	get templateId(): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IBreakdownTemplateData {
		const data: IBreakdownTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();

		data.container = $('.breakdown-list-item');
		container.appendChild(data.container);

		return data;
	}

	renderElement(element: IAideChatBreakdownViewModel, index: number, templateData: IBreakdownTemplateData, height: number | undefined): void {
		dom.clearNode(templateData.container);
		templateData.container.appendChild(BreakdownItemRenderer.render(element, this.markdownRenderer));
	}

	disposeTemplate(templateData: IBreakdownTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class BreakdownItemRenderer {
	static render(
		element: IAideChatBreakdownViewModel,
		markdownRenderer: MarkdownRenderer
	): HTMLElement {
		const rowContainer = $('div.breakdown-list-item-row');

		const { query, reason, response } = element;
		if (query) {
			const rowQuery = $('div.breakdown-query');
			const renderedContent = markdownRenderer.render(query);
			rowQuery.appendChild(renderedContent.element);
			rowContainer.appendChild(rowQuery);
		}

		if (reason) {
			const rowReason = $('div.breakdown-reason');
			const renderedContent = markdownRenderer.render(reason);
			rowReason.appendChild(renderedContent.element);
			rowContainer.appendChild(rowReason);
		}

		if (response) {
			const rowResponse = $('div.breakdown-response');
			const renderedContent = markdownRenderer.render(response);
			rowResponse.appendChild(renderedContent.element);
			rowContainer.appendChild(rowResponse);
		}

		return rowContainer;
	}
}

class BreakdownsListDelegate implements IListVirtualDelegate<IAideChatBreakdownViewModel> {
	private offsetHelper: HTMLElement;
	private markdownRenderer: MarkdownRenderer;

	constructor(
		container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.offsetHelper = this.createOffsetHelper(container);
		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
	}

	private createOffsetHelper(container: HTMLElement): HTMLElement {
		const offsetHelper = $('div.breakdown-offset-helper');
		container.appendChild(offsetHelper);

		return offsetHelper;
	}

	getHeight(element: IAideChatBreakdownViewModel): number {
		const renderedRow = BreakdownItemRenderer.render(element, this.markdownRenderer);
		this.offsetHelper.appendChild(renderedRow);

		const height = Math.max(this.offsetHelper.offsetHeight, this.offsetHelper.scrollHeight);

		dom.clearNode(this.offsetHelper);

		return height;
	}

	getTemplateId(element: IAideChatBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}
}
