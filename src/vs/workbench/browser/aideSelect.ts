/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';

const $ = dom.$;

interface ChangeOptionEvent<T> {
	index: number;
	element: T;
}

export interface RenderItemFn<T> {
	(container: HTMLElement, item: T): IDisposable[];
}

export class AideSelect<T> extends Disposable {

	private _focusIndex: number | undefined;
	get focusIndex() { return this._focusIndex; }
	defaultItemHeight = 36;
	maxHeight = Number.POSITIVE_INFINITY;
	readonly list: WorkbenchList<T>;

	private readonly _onDidChangeFocus = this._register(new Emitter<ChangeOptionEvent<T>>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private readonly _onDidSelect = this._register(new Emitter<ChangeOptionEvent<T>>());
	readonly onDidSelect = this._onDidSelect.event;

	constructor(panel: HTMLElement, renderItem: RenderItemFn<T>, @IInstantiationService private readonly instantiationService: IInstantiationService) {

		super();
		// List

		const renderer = this.instantiationService.createInstance(OptionRenderer<T>, renderItem, this.defaultItemHeight);
		const listDelegate = this.instantiationService.createInstance(ItemListDelegate<T>, this.defaultItemHeight);
		const list = this.list = this._register(<WorkbenchList<T>>this.instantiationService.createInstance(
			WorkbenchList,
			'AideSelect',
			panel,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		));

		this._register(list.onDidChangeContentHeight(height => {
			//console.log('onDidChangeContentHeight', height);
			const newHeight = Math.min(height, this.maxHeight);
			list.layout(newHeight);
		}));
		this._register(renderer.onDidChangeItemHeight(event => {
			//console.log('onDidChangeItemHeight', event);
			list.updateElementHeight(event.index, event.height);
		}));
		this._register(list.onDidChangeFocus(event => {
			//console.log('onDidChangeFocus', event);
			if (event.indexes.length === 1) {
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);

				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					this._focusIndex = index;
				}
			}
		}));
		this._register(list.onDidOpen(event => {
			if (this._focusIndex !== undefined && event.element) {
				this._onDidSelect.fire({ index: this._focusIndex, element: event.element });
			}
		}));
	}
}


interface ITemplateData<T> {
	currentItem?: T;
	currentItemIndex?: number;
	currentRenderedHeight: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams<T> {
	element: T;
	index: number;
	height: number;
}

class OptionRenderer<T> extends Disposable implements IListRenderer<T, ITemplateData<T>> {
	static readonly TEMPLATE_ID = 'aideOptionTemplate';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams<T>>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams<T>> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly renderItem: RenderItemFn<T>,
		private readonly defaultItemHeight: number
	) {
		super();
	}

	get templateId(): string {
		return OptionRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ITemplateData<T> {
		const data: ITemplateData<T> = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.aide-option-item'));
		return data;
	}

	renderElement(element: T, index: number, templateData: ITemplateData<T>): void {

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const disposables = this.renderItem(templateData.container, element);
		function addDisposable(d: IDisposable) {
			templateData.toDispose.add(d);
		}

		disposables.forEach(addDisposable);
		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: ITemplateData<T>): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: ITemplateData<T>): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.container.offsetHeight || this.defaultItemHeight;
		const shouldFireEvent = !templateData.currentRenderedHeight || templateData.currentRenderedHeight !== newHeight;
		templateData.currentRenderedHeight = newHeight;
		if (shouldFireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				templateData.currentRenderedHeight = templateData.container.offsetHeight || this.defaultItemHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: templateData.currentRenderedHeight });
			}));
		}
	}
}

class ItemListDelegate<T> implements IListVirtualDelegate<T> {

	constructor(private readonly defaultItemHeight: number) { }

	getHeight(element: T): number {
		// Implement custom height for each element
		return this.defaultItemHeight;
	}

	getTemplateId(element: T): string {
		return OptionRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: T): boolean {
		return true;
	}
}
