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
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { relativePath } from 'vs/base/common/resources';
//import { IEditorProgressService } from 'vs/platform/progress/common/progress';

const $ = dom.$;


interface ChangeSymbolInfoEvent {
	index: number;
	element: IAideProbeBreakdownViewModel;
}


export class AideProbeSymbolInfo extends Disposable {

	private readonly _onDidChangeFocus = this._register(new Emitter<ChangeSymbolInfoEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;
	private userFocusIndex: number | undefined;

	private activeSymbolInfo: IAideProbeBreakdownViewModel | undefined;

	container: HTMLElement;
	private header: HTMLElement;
	private headerText: HTMLElement;
	private loadingSpinner: HTMLElement | undefined;
	private actionsToolbar: MenuWorkbenchToolBar;
	private listContainer: HTMLElement;
	private list: WorkbenchList<IAideProbeBreakdownViewModel> | undefined;
	private emptyListPlaceholder: HTMLElement;
	private renderer: SymbolInfoRenderer;
	private viewModel: IAideProbeBreakdownViewModel[] = [];
	maxItems: number = 8;

	private isVisible: boolean | undefined;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		container: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
	) {
		super();
		this.container = container;

		this.header = $('.symbol-info-header');
		dom.hide(this.header);
		this.container.appendChild(this.header);
		this.headerText = $('.symbol-info-header-text');
		this.header.appendChild(this.headerText);


		this.listContainer = $('.symbol-info-list-container');
		this.container.appendChild(this.listContainer);

		this.emptyListPlaceholder = $('.symbol-info-empty-list-placeholder');
		this.emptyListPlaceholder.textContent = 'No symbols match your query';
		this.container.appendChild(this.emptyListPlaceholder);
		dom.hide(this.emptyListPlaceholder);

		const toolbarContainer = $('.symbol-info-toolbar-container');
		this.header.appendChild(toolbarContainer);

		this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AideCommandPaletteActions, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(ActionViewItemWithKb, action);
				}
				return;
			}
		}));
		this.actionsToolbar.getElement().classList.add('symbol-info-actions');

		this.renderer = this._register(this.instantiationService.createInstance(SymbolInfoRenderer, this.resourceLabels));
	}

	get contentHeight(): number | undefined {
		if (!this.list) {
			return;
		}
		return this.list.contentHeight + 36;
	}

	show(headerText: string = 'New request', isLoading: boolean): void {

		this.headerText.textContent = headerText;

		dom.show(this.header);

		if (isLoading) {
			if (!this.loadingSpinner) {
				const progressIcon = ThemeIcon.modify(Codicon.loading, 'spin');
				this.loadingSpinner = $('.symbol-info-spinner');
				this.loadingSpinner.classList.add(...ThemeIcon.asClassNameArray(progressIcon));
				this.header.prepend(this.loadingSpinner);
			}
		} else {
			if (this.loadingSpinner) {
				this.header.removeChild(this.loadingSpinner);
				this.loadingSpinner = undefined;
			}
		}

		if (this.isVisible) {
			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createSymbolInfosList(this.listContainer);
		}

		// Make visible
		this.isVisible = true;
	}

	private createSymbolInfosList(listContainer: HTMLElement): void {

		// List
		const listDelegate = this.instantiationService.createInstance(SymbolInfoListDelegate);
		const list = this.list = this._register(<WorkbenchList<IAideProbeBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'SymbolInfosList',
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
			console.log(height, this.maxItems * 52.39);
			const newHeight = Math.min(height, this.maxItems * 52.39);
			list.layout(newHeight);
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			list.updateElementHeight(e.index, e.height);
		}));
		this._register(list.onDidChangeFocus(event => {
			if (event.indexes.length === 1) {
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);


				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					this.userFocusIndex = index;
				}

				if (element && element.uri && element.name) {
					this.openSymbolInfoReference(element, !!event.browserEvent);
				}
			}
		}));
		this._register(list.onDidOpen(async e => {
			if (e.element && e.element.uri && e.element.name) {
				const index = this.getSymbolInfoListIndex(e.element);

				if (e.browserEvent) {
					this.userFocusIndex = index;
				}

				this._onDidChangeFocus.fire({ index, element: e.element });
				this.openSymbolInfoReference(e.element, !!e.browserEvent);
			}
		}));
	}

	setFocus(index: number, browserEvent?: UIEvent) {
		if (!this.list) {
			return;
		}

		const max = this.viewModel.length;
		index = Math.min(Math.max(index, 0), max - 1);
		this.list.setFocus([index], browserEvent);
		this.list.reveal(index);
	}

	private getSymbolInfoListIndex(element: IAideProbeBreakdownViewModel): number {
		let matchIndex = -1;
		this.viewModel.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openSymbolInfoReference(element: IAideProbeBreakdownViewModel, setFocus: boolean = false): Promise<void> {

		if (this.activeSymbolInfo === element) {
			return;
		} else {
			this.activeSymbolInfo = element;
			const index = this.getSymbolInfoListIndex(element);
			if (this.list && index !== -1 && setFocus) {
				this.list.setFocus([index]);
				this.explanationService.changeActiveBreakdown(element);
			}
		}

		//const resolveLocationOperation = element.symbol;
		//this.editorProgressService.showWhile(resolveLocationOperation);
		//await resolveLocationOperation;

	}

	updateSymbolInfo(symbolInfo: ReadonlyArray<IAideProbeBreakdownViewModel>): void {
		const list = assertIsDefined(this.list);

		let matchingIndex = -1;
		if (this.viewModel.length === 0) {
			this.viewModel = [...symbolInfo];
			list.splice(0, 0, symbolInfo);
		} else {
			symbolInfo.forEach((symbol) => {
				const matchIndex = this.getSymbolInfoListIndex(symbol);
				if (matchIndex === -1) {
					this.viewModel.push(symbol);
					list.splice(this.viewModel.length - 1, 0, [symbol]);
				} else {
					this.viewModel[matchIndex] = symbol;
					list.splice(matchIndex, 1, [symbol]);
				}
				matchingIndex = matchIndex;
			});
		}

		list.rerender();

		if (this.userFocusIndex !== undefined) {
			list.setFocus([this.userFocusIndex]);
		} else if (matchingIndex !== -1) {
			list.setFocus([matchingIndex]);
		}

		this.layout();
	}

	filterSymbolInfo(filteredSymbols: ReadonlyArray<IAideProbeBreakdownViewModel>): void {
		const list = this.list;
		if (!list) {
			return;
		}
		const currentFocus = list.getFocus()[0];
		let focusIndex = -1;

		this.viewModel = filteredSymbols.slice();
		list.splice(0, list.length, filteredSymbols);

		// Attempt to maintain focus
		if (currentFocus !== undefined) {
			const previouslyFocusedSymbol = this.viewModel[currentFocus];
			focusIndex = filteredSymbols.findIndex(symbol =>
				symbol.uri === previouslyFocusedSymbol?.uri &&
				symbol.name === previouslyFocusedSymbol?.name
			);
		}

		list.rerender();

		if (focusIndex !== -1) {
			list.setFocus([focusIndex]);
		} else if (filteredSymbols.length > 0) {
			list.setFocus([0]);
		}

		if (list.length === 0) {
			dom.show(this.emptyListPlaceholder);
			dom.hide(this.listContainer);
		} else {
			dom.hide(this.emptyListPlaceholder);
			dom.show(this.listContainer);
		}

		// TODO: Fix height bug when the list is not epty but the layout
		// calculates its height as 0

		this.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		this.userFocusIndex = undefined;
		dom.hide(this.header);

		// Remove all explanation widgets and go-to-definition widgets
		this.explanationService.clear();

		// Hide
		this.isVisible = false;

		// Clear list
		this.list.splice(0, this.viewModel.length);

		// Clear view model
		this.viewModel = [];
	}

	layout(width?: number): void {
		if (this.list) {
			this.container.style.height = `${this.list.renderHeight + 36 + (this.list.length === 0 ? 42 : 0)}px`;
			this.list.layout(this.list.renderHeight, width);
		}
	}
}

interface DiffStat {
	added: number;
	removed: number;
}

class SymbolInfoDiffStat extends Disposable {

	private maxStat: number = 6;

	constructor(
		container: HTMLElement,
		private readonly added: number,
		private readonly removed: number,
	) {
		super();

	}


	private render() {
		const statContainer = $('.symbol-info-diff-stat-container');
		let index = 0;
	}



}

interface ISymbolInfoTemplateData {
	currentItem?: IAideProbeBreakdownViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideProbeBreakdownViewModel;
	index: number;
	height: number;
}

class SymbolInfoRenderer extends Disposable implements IListRenderer<IAideProbeBreakdownViewModel, ISymbolInfoTemplateData> {
	static readonly TEMPLATE_ID = 'symbolInfoListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();
	}

	get templateId(): string {
		return SymbolInfoRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ISymbolInfoTemplateData {
		const data: ISymbolInfoTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();

		data.container = dom.append(container, $('.symbol-info-list-item'));

		return data;
	}

	renderElement(element: IAideProbeBreakdownViewModel, index: number, templateData: ISymbolInfoTemplateData, height: number | undefined): void {
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name } = element;
		if (uri) {
			const rowResource = $('div.symbol-info-resource');
			const label = this.resourceLabels.create(rowResource, { supportHighlights: true });
			label.element.style.display = 'flex';


			const workspaceFolder = this.contextService.getWorkspace().folders[0];
			const workspaceFolderUri = workspaceFolder.uri;
			const path = relativePath(workspaceFolderUri, uri);

			label.setResource({ resource: uri, name, description: path }, {
				fileKind: FileKind.FILE,
				icon: SymbolKinds.toIcon(SymbolKind.Method),
			});
			templateDisposables.add(label);
			templateData.container.appendChild(rowResource);

			element.symbol.then(symbol => {
				if (symbol && symbol.kind) {
					label.setResource({ resource: uri, name, description: path }, {
						fileKind: FileKind.FILE,
						icon: SymbolKinds.toIcon(symbol.kind),
					});
				}
			});
		}

		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: ISymbolInfoTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: ISymbolInfoTemplateData): void {
		if (!templateData.currentItem || typeof templateData.currentItemIndex !== 'number') {
			return;
		}

		const { currentItem: element, currentItemIndex: index } = templateData;

		const newHeight = templateData.container.offsetHeight || 52;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.toDispose.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.container), () => {
				element.currentRenderedHeight = templateData.container.offsetHeight || 52;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, index, height: element.currentRenderedHeight });
			}));
		}
	}
}

class SymbolInfoListDelegate implements IListVirtualDelegate<IAideProbeBreakdownViewModel> {
	private defaultElementHeight: number = 52;

	getHeight(element: IAideProbeBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideProbeBreakdownViewModel): string {
		return SymbolInfoRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeBreakdownViewModel): boolean {
		return true;
	}
}
