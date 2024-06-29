/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { assertIsDefined } from 'vs/base/common/types';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';

const $ = dom.$;

export class AideChatBreakdowns extends Disposable {
	private readonly _onDidChangeFocus = this._register(new Emitter<IAideProbeBreakdownViewModel>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private activeBreakdown: IAideProbeBreakdownViewModel | undefined;

	private list: WorkbenchList<IAideProbeBreakdownViewModel> | undefined;
	private renderer: BreakdownRenderer;
	private viewModel: IAideProbeBreakdownViewModel[] = [];
	private isVisible: boolean | undefined;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(BreakdownRenderer, this.resourceLabels));
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
		// List
		const listDelegate = this.instantiationService.createInstance(BreakdownsListDelegate);
		const list = this.list = this._register(<WorkbenchList<IAideProbeBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			listContainer,
			listDelegate,
			[this.renderer],
			{
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false
			}
		));

		this._register(list.onDidChangeContentHeight(height => {
			list.layout(height);
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.index, e.height);
		}));
		this._register(list.onDidChangeFocus(e => {
			if (e.indexes.length === 1) {
				const index = e.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);
				this._onDidChangeFocus.fire(element);
				if (element && element.uri && element.name) {
					this.openBreakdownReference(element);
				}
			}
		}));
		this._register(list.onDidOpen(async e => {
			if (e.element && e.element.uri && e.element.name) {
				this._onDidChangeFocus.fire(e.element);
				this.openBreakdownReference(e.element);
			}
		}));
	}

	private getBreakdownListIndex(element: IAideProbeBreakdownViewModel): number {
		let matchIndex = -1;
		this.viewModel.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openBreakdownReference(element: IAideProbeBreakdownViewModel): Promise<void> {
		if (this.activeBreakdown === element) {
			return;
		} else {
			this.activeBreakdown = element;
			const index = this.getBreakdownListIndex(element);
			if (this.list && index !== -1) {
				this.list.setFocus([index]);
			}
		}

		this.explanationService.changeActiveBreakdown(element);
	}

	updateBreakdowns(breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>): void {
		const list = assertIsDefined(this.list);

		let matchingIndex = -1;
		if (this.viewModel.length === 0) {
			this.viewModel = [...breakdowns];
			list.splice(0, 0, breakdowns);
		} else {
			breakdowns.forEach((breakdown) => {
				const matchIndex = this.getBreakdownListIndex(breakdown);
				if (matchIndex === -1) {
					this.viewModel.push(breakdown);
					list.splice(this.viewModel.length - 1, 0, [breakdown]);
				} else {
					this.viewModel[matchIndex] = breakdown;
					list.splice(matchIndex, 1, [breakdown]);
				}
				matchingIndex = matchIndex;
			});
		}

		this.list?.rerender();
		if (matchingIndex !== -1) {
			this.list?.setFocus([matchingIndex]);
		}

		this.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		// Remove all explanation widgets and go-to-definition widgets
		this.explanationService.clearBreakdowns();

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
	currentItem?: IAideProbeBreakdownViewModel;
	currentItemIndex?: number;
	wrapper: HTMLElement;
	container: HTMLElement;
	progressIndicator: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideProbeBreakdownViewModel;
	index: number;
	height: number;
}

class BreakdownRenderer extends Disposable implements IListRenderer<IAideProbeBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownsListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
	) {
		super();
	}

	get templateId(): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IBreakdownTemplateData {
		const data: IBreakdownTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();

		data.wrapper = dom.append(container, $('.breakdown-list-item-wrapper'));
		// Content
		data.container = $('.breakdown-list-item');
		data.wrapper.appendChild(data.container);

		// Progress indicator
		data.progressIndicator = $('.breakdown-list-item-details');
		data.wrapper.appendChild(data.progressIndicator);

		return data;
	}

	renderElement(element: IAideProbeBreakdownViewModel, index: number, templateData: IBreakdownTemplateData, height: number | undefined): void {
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name, response } = element;
		if (uri) {
			const rowResource = $('div.breakdown-resource');
			const label = this.resourceLabels.create(rowResource, { supportHighlights: true });
			label.element.style.display = 'flex';
			label.setResource({ resource: uri, name, description: basenameOrAuthority(uri) }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(SymbolKind.Method),
			});
			templateDisposables.add(label);
			templateData.container.appendChild(rowResource);

			element.symbol.then(symbol => {
				if (symbol && symbol.kind) {
					label.setResource({ resource: uri, name, description: basenameOrAuthority(uri) }, {
						fileKind: FileKind.FILE,
						icon: SymbolKinds.toIcon(symbol.kind),
					});
				}
			});
		}

		const completeIcon = Codicon.arrowRight;
		const progressIcon = ThemeIcon.modify(Codicon.loading, 'spin');
		if (response && response.value.length > 0) {
			templateData.progressIndicator.classList.remove(...ThemeIcon.asClassNameArray(progressIcon));
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(completeIcon));
		} else {
			templateData.progressIndicator.classList.remove(...ThemeIcon.asClassNameArray(completeIcon));
			templateData.progressIndicator.classList.add(...ThemeIcon.asClassNameArray(progressIcon));
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

		const newHeight = templateData.wrapper.offsetHeight || 22;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.wrapper), () => {
				element.currentRenderedHeight = templateData.wrapper.offsetHeight || 22;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: element.currentRenderedHeight });
			}));
		}
	}
}

class BreakdownsListDelegate implements IListVirtualDelegate<IAideProbeBreakdownViewModel> {
	private defaultElementHeight: number = 22;

	getHeight(element: IAideProbeBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideProbeBreakdownViewModel): string {
		return BreakdownRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeBreakdownViewModel): boolean {
		return true;
	}
}
