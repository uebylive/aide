/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Emitter, Event } from 'vs/base/common/event';
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
	private renderer: BreakdownRenderer | undefined;
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
		this.listContainer = $('.chat-breakdowns-list');

		// Breakdown renderer
		const renderer = this.renderer = this.instantiationService.createInstance(BreakdownRenderer);

		// List
		const listDelegate = this.listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate);
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

		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.list?.updateElementHeight(e.index, e.height);
		}));

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
	currentItem?: IAideChatBreakdownViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideChatBreakdownViewModel;
	index: number;
	height: number;
}

class BreakdownRenderer extends Disposable implements IListRenderer<IAideChatBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownsListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

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
		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);
		templateData.container.appendChild(BreakdownItemRenderer.render(element, this.markdownRenderer));
		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: IBreakdownTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IBreakdownTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const newHeight = templateData.container.offsetHeight;
		templateData.currentItem.currentRenderedHeight = newHeight;
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
	private defaultElementHeight: number = 22;

	getHeight(element: IAideChatBreakdownViewModel): number {
		return element.currentRenderedHeight ?? this.defaultElementHeight;
	}

	getTemplateId(element: IAideChatBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideChatBreakdownViewModel): boolean {
		return true;
	}
}
