/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IAideChatBreakdownViewModel } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ResourceLabels } from 'vs/workbench/browser/labels';

const $ = dom.$;

export class AideChatBreakdowns extends Disposable {
	private list: WorkbenchList<IAideChatBreakdownViewModel> | undefined;
	private renderer: BreakdownRenderer | undefined;
	private viewModel: IAideChatBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	show(container: HTMLElement): void {
		if (this.isVisible) {
			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createBreakdownsList(container);
		}

		// Make visible
		this.isVisible = true;
	}

	private createBreakdownsList(listContainer: HTMLElement): void {
		// Breakdown renderer
		const renderer = this.renderer = this.instantiationService.createInstance(BreakdownRenderer);

		// List
		const listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate);
		const list = this.list = <WorkbenchList<IAideChatBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			listContainer,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		);

		this._register(list.onDidChangeContentHeight(height => {
			list.layout(height);
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.index, e.height + 12);
		}));
		this._register(list.onDidChangeFocus(e => {
			if (e.indexes.length === 1) {
				const index = e.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);
				if (element && element.uri && element.name) {
					this.openBreakdownReference(element.uri, element.name);
				}
			}
		}));
		this._register(list.onDidOpen(async e => {
			if (e.element && e.element.uri && e.element.name) {
				this.openBreakdownReference(e.element.uri, e.element.name);
			}
		}));
	}

	private async openBreakdownReference(uri: URI, name: string): Promise<void> {
		try {
			let document = this.modelService.getModel(uri);
			if (!document) {
				const ref = await this.textModelResolverService.createModelReference(uri);
				const sourceModel = ref.object.textEditorModel;
				document = this.modelService.createModel(
					createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
					this.languageService.createById(sourceModel.getLanguageId()),
					uri
				);
				ref.dispose();
			}

			const model = await this.outlineModelService.getOrCreate(document, CancellationToken.None);
			const symbols = model.getTopLevelSymbols();
			const symbol = symbols.find(s => s.name === name);
			if (!symbol) {
				return;
			}

			this.editorService.openEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: true,
					selection: symbol.range,
					selectionRevealType: TextEditorSelectionRevealType.NearTop
				}
			});
		} catch (e) {
			this.editorService.openEditor({
				resource: uri,
				options: {
					pinned: false,
					preserveFocus: true,
				}
			});
		}
	}

	updateBreakdowns(breakdowns: IAideChatBreakdownViewModel[]): void {
		const list = assertIsDefined(this.list);

		this.viewModel = breakdowns;
		list.splice(0, list.length, breakdowns);
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

	layout(width?: number): void {
		if (this.list) {
			this.list.layout(undefined, width);
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

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly markdownRenderer: MarkdownRenderer;
	private resourceLabels: ResourceLabels;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
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
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { query, reason, response, uri } = element;
		if (query && query.value.trim().length > 0) {
			const rowQuery = $('div.breakdown-query');
			const renderedContent = this.markdownRenderer.render(query);
			rowQuery.appendChild(renderedContent.element);
			templateData.container.appendChild(rowQuery);
		}

		if (reason && reason.value.trim().length > 0) {
			const rowReason = $('div.breakdown-reason');
			const renderedContent = this.markdownRenderer.render(reason);
			rowReason.appendChild(renderedContent.element);
			templateData.container.appendChild(rowReason);
		}

		if (response && response.value.trim().length > 0) {
			const rowResponse = $('div.breakdown-response');
			const renderedContent = this.markdownRenderer.render(response);
			rowResponse.appendChild(renderedContent.element);
			templateData.container.appendChild(rowResponse);
		}

		if (uri) {
			const rowResource = $('div.breakdown-resource');
			const label = this.resourceLabels.create(rowResource, { supportHighlights: true });
			templateDisposables.add(label);
			label.setLabel(uri.path.split('/').at(-1));
			label.setFile(uri);
			templateData.container.appendChild(rowResource);
		}

		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: IBreakdownTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IBreakdownTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.container.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.container.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: element.currentRenderedHeight });
			}));
		}
	}
}

class BreakdownsListDelegate implements IListVirtualDelegate<IAideChatBreakdownViewModel> {
	private defaultElementHeight: number = 22;

	getHeight(element: IAideChatBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight) + 12;
	}

	getTemplateId(element: IAideChatBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideChatBreakdownViewModel): boolean {
		return true;
	}
}
