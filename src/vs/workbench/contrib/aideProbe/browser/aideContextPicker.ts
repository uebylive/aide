/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Emitter, Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const $ = dom.$;

export class SpecificContextPicker extends Disposable {

	private list: WorkbenchList<URI>;
	private listElement: HTMLElement;
	private inputElement: HTMLElement;
	private readonly defaultItemHeight = 36;

	constructor(
		private readonly parent: HTMLElement,
		readonly context: URI[],
		maxHeight: number,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const listElement = this.listElement = $('.aide-context-picker-list');
		const renderer = this.instantiationService.createInstance(Renderer, this.defaultItemHeight);
		const listDelegate = this.instantiationService.createInstance(ItemListDelegate, this.defaultItemHeight);
		this.list = this._register(<WorkbenchList<URI>>this.instantiationService.createInstance(
			WorkbenchList,
			'AideSelect',
			listElement,
			listDelegate,
			[renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		));

		this.inputElement = $('.aide-context-picker-input');

		this._register(this.editorService.onDidActiveEditorChange(() => {
			const editor = this.editorService.activeTextEditorControl;
			if (!isCodeEditor(editor)) {
				return;
			}
			const model = editor.getModel();
			if (model) {
				this.render(model.uri, this.context);
			}

			this.parent.classList.toggle('active', !!this.editorService.activeTextEditorControl);
		}));
	}

	render(currentFile: URI, userSpecifiedContext: URI[]) {

		//this.list.splice(0, 0);
		//this.list.rerender();


	}

}

interface ITemplateData {
	currentItem?: URI;
	currentItemIndex?: number;
	currentRenderedHeight: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: URI;
	index: number;
	height: number;
}


class Renderer extends Disposable implements IListRenderer<URI, ITemplateData> {
	static readonly TEMPLATE_ID = 'aideOptionTemplate';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly defaultItemHeight: number
	) {
		super();
	}

	get templateId(): string {
		return Renderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ITemplateData {
		const data: ITemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.aide-option-item'));
		return data;
	}

	renderElement(element: URI, index: number, templateData: ITemplateData): void {

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);


		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: ITemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: ITemplateData): void {
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

class ItemListDelegate implements IListVirtualDelegate<URI> {

	constructor(private readonly defaultItemHeight: number) { }

	getHeight(element: URI): number {
		// Implement custom height for each element
		return this.defaultItemHeight;
	}

	getTemplateId(element: URI): string {
		return Renderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: URI): boolean {
		return true;
	}
}
