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
	private list: WorkbenchList<IAideChatBreakdownViewModel> | undefined;
	private listDelegate: BreakdownsListDelegate | undefined;
	private viewModel: IAideChatBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	constructor(
		private readonly listContainer: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	getHTMLElement(): HTMLElement {
		return this.listContainer;
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
		// Breakdown renderer
		const renderer = this.instantiationService.createInstance(BreakdownRenderer);

		// List
		const listDelegate = this.listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate, this.listContainer);
		const list = this.list = <WorkbenchList<IAideChatBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			this.listContainer,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
			}
		);

		this._register(renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.index, e.height);
			this.updateBreakdownHeight(e.element);
		}));
		this._register(list.onDidChangeContentHeight(() => {
			this._onDidChangeContentHeight.fire();
		}));
	}

	updateBreakdowns(breakdowns: IAideChatBreakdownViewModel[]): void {
		const list = assertIsDefined(this.list);

		if (breakdowns.length === 0) {
			return;
		}

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

	layout(width: number): void {
		if (this.listContainer && this.list) {
			this.listContainer.style.width = `${width}px`;

			this.list.layout();
		}
	}
}

interface IBreakdownTemplateData {
	container: HTMLElement;
	toDispose: DisposableStore;
	elementDisposables: DisposableStore;
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
		dom.clearNode(templateData.container);
		templateData.container.appendChild(BreakdownItemRenderer.render(element, this.markdownRenderer));

		const newHeight = templateData.container.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.container.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire(
					{ element, index, height: element.currentRenderedHeight }
				);
			}));
		}
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
		const parentWidth = this.offsetHelper.parentElement?.clientWidth || 0;
		this.offsetHelper.style.width = `${parentWidth}px`;

		const renderedRow = BreakdownItemRenderer.render(element, this.markdownRenderer);
		this.offsetHelper.appendChild(renderedRow);
		const newHeight = this.offsetHelper.offsetHeight;
		element.currentRenderedHeight = newHeight;

		const height = Math.max(this.offsetHelper.offsetHeight, this.offsetHelper.scrollHeight);

		dom.clearNode(this.offsetHelper);

		return height;
	}

	getTemplateId(element: IAideChatBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideChatBreakdownViewModel): boolean {
		return true;
	}
}
