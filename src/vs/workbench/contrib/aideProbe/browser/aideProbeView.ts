/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { relativePath } from 'vs/base/common/resources';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/aideProbe';
import 'vs/css!./media/aideProbeExplanationWidget';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IDimension } from 'vs/editor/common/core/dimension';
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Heroicon } from 'vs/workbench/browser/heroicon';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { AideProbeViewModel, IAideProbeBreakdownViewModel, IAideProbeInitialSymbolsViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { AideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';

const $ = dom.$;

export class AideProbeViewPane extends ViewPane {
	private container!: HTMLElement;
	private resultWrapper!: HTMLElement;
	private responseWrapper!: HTMLElement;
	private scrollableElement!: DomScrollableElement;
	private dimensions: IDimension | undefined;


	private model: IAideProbeModel | undefined;
	private viewModel: AideProbeViewModel | undefined;

	planListFocusIndex: number | undefined;
	private planList: WorkbenchList<IAideProbeInitialSymbolsViewModel> | undefined;

	breakdownsListFocusIndex: number | undefined;
	private breakdownsList: WorkbenchList<IAideProbeBreakdownViewModel> | undefined;


	private readonly _onDidChangeFocus = this._register(new Emitter<IListChangeEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private readonly markdownRenderer: MarkdownRenderer;

	private readonly viewModelDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.markdownRenderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));

		this.init();
		this._register(aideProbeService.onNewEvent(() => {
			if (!this.model) {
				this.init();
			}
		}));
	}

	private init() {
		this.model = this.aideProbeService.getSession();
		if (this.model) {
			this.viewModel = this.instantiationService.createInstance(AideProbeViewModel, this.model);
			this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange)(() => {
				this.updatePlanList();
				this.updateBreakdownsList();
			}));
		}
	}


	private createPlanList() {
		const header = $('.list-header');
		this._register(this.instantiationService.createInstance(Heroicon, header, 'micro/list-bullet'));
		const headerText = $('.header-text');
		headerText.textContent = 'Plan';
		header.appendChild(headerText);
		this.responseWrapper.append(header);

		const listDelegate = this.instantiationService.createInstance(PlanListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(PlanListRenderer));
		const listContainer = $('.list-container');
		this.responseWrapper.append(listContainer);

		const list = this._register(<WorkbenchList<IAideProbeInitialSymbolsViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'PlanList',
			listContainer,
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
			list.layout(height);
		}));
		this._register(renderer.onDidChangeItemHeight(event => {
			list.updateElementHeight(event.index, event.height);
		}));
		this._register(list.onDidChangeFocus(event => {
			if (event.indexes.length === 1) {
				this.breakdownsList?.setFocus([]);
				this.breakdownsList?.setSelection([]);
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);

				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					console.log('planListBrowserEvent');
					this.planListFocusIndex = index;
				}

				if (element && element.uri && element.symbolName) {
					this.openPlanReference(element, !!event.browserEvent);
				}
			}
		}));


		this._register(list.onKeyDown((e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.DownArrow) && this.planListFocusIndex === list.length - 1) {
				this.planList?.setFocus([]);
				this.planList?.setSelection([]);
				this.breakdownsList?.setFocus([0]);
				this.breakdownsList?.setSelection([0]);
			}
		}));

		this._register(list.onDidOpen(async (event) => {
			const { element } = event;
			if (element && element.uri && element.symbolName) {
				const index = this.getPlanListIndex(element);

				if (event.browserEvent) {
					this.planListFocusIndex = index;
				}

				this._onDidChangeFocus.fire({ index, element: element });
				this.openPlanReference(element, !!event.browserEvent);
			}
		}));

		return list;
	}

	private getPlanListIndex(element: IAideProbeInitialSymbolsViewModel): number {
		let matchIndex = -1;
		this.viewModel?.initialSymbols.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.symbolName === element.symbolName) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openPlanReference(element: IAideProbeInitialSymbolsViewModel, setFocus: boolean = false): Promise<void> {
		const index = this.getPlanListIndex(element);
		if (this.planList && index !== -1 && setFocus) {
			this.planList.setFocus([index]);
			//this.explanationService.changeActiveBreakdown(element);
		}
	}

	private updatePlanList() {
		if (!this.planList && this.viewModel?.initialSymbols.length) {
			this.planList = this.createPlanList();
			return;
		}
		if (!this.viewModel || !this.planList) {
			return;
		}
		const initialSymbols = this.viewModel.initialSymbols;
		let matchingIndex = -1;
		if (initialSymbols.length === 0) {
			this.planList.splice(0, 0, initialSymbols);
		} else {
			initialSymbols.forEach((symbol) => {
				const matchIndex = this.getPlanListIndex(symbol);
				if (this.planList) {
					if (matchIndex === -1) {
						this.planList.splice(initialSymbols.length - 1, 0, [symbol]);
					} else {
						this.planList.splice(matchIndex, 1, [symbol]);
					}
				}
				matchingIndex = matchIndex;
			});
		}

		if (this.planListFocusIndex !== undefined) {
			this.planList.setFocus([this.planListFocusIndex]);
		} else if (matchingIndex !== -1) {
			this.planList.setFocus([matchingIndex]);
		}

		this.planList.rerender();
	}

	private createBreakdownsList() {

		const header = $('.list-header');
		this._register(this.instantiationService.createInstance(Heroicon, header, 'micro/code-bracket'));
		const headerText = $('.header-text');
		headerText.textContent = 'Edits';
		header.appendChild(headerText);
		this.responseWrapper.append(header);


		const listDelegate = this.instantiationService.createInstance(BreakdownListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(BreakdownListRenderer));
		const listContainer = $('.breakdown-list-container');
		this.responseWrapper.append(listContainer);

		const list = this._register(<WorkbenchList<IAideProbeBreakdownViewModel>>this.instantiationService.createInstance(
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
		));

		this._register(list.onDidChangeContentHeight(height => {
			list.layout(height);
		}));
		this._register(renderer.onDidChangeItemHeight(event => {
			list.updateElementHeight(event.index, event.height);
		}));
		this._register(list.onDidChangeFocus(event => {
			if (event.indexes.length === 1) {
				this.planList?.setFocus([]);
				this.planList?.setSelection([]);
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);


				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					console.log('breakdownsListBrowserEvent');
					this.breakdownsListFocusIndex = index;
				}

				if (event.browserEvent && element && element.uri && element.name) {
					this.openBreakdownReference(element);
				}
			}
		}));

		this._register(list.onKeyDown((e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.UpArrow) && this.breakdownsListFocusIndex === 0) {
				event.preventDefault();
				this.planList?.focusLast();
				this.planList?.setSelection([this.planList.length - 1]);
				this.breakdownsList?.setFocus([]);
				this.breakdownsList?.setSelection([]);
			}
		}));

		this._register(list.onDidOpen(async (event) => {
			const { element } = event;
			if (element && element.uri && element.name) {
				const index = this.getBreakdownListIndex(element);

				if (event.browserEvent) {
					this.breakdownsListFocusIndex = index;
				}

				element.expanded = !element.expanded;
				list.splice(index, 1, [element]);
				list.rerender();

				this._onDidChangeFocus.fire({ index, element: element });
				if (event.browserEvent) {
					this.openBreakdownReference(element);
				}
			}
		}));

		return list;
	}

	private getBreakdownListIndex(element: IAideProbeBreakdownViewModel): number {
		let matchIndex = -1;
		this.viewModel?.breakdowns.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openBreakdownReference(element: IAideProbeBreakdownViewModel): Promise<void> {

		const index = this.getBreakdownListIndex(element);
		if (this.breakdownsList && index !== -1) {
			this.explanationService.changeActiveBreakdown(element);
		}

	}

	private updateBreakdownsList() {
		if (!this.breakdownsList && this.viewModel?.breakdowns.length) {
			this.breakdownsList = this.createBreakdownsList();
			return;
		}
		if (!this.viewModel || !this.breakdownsList) {
			return;
		}
		const breakdowns = this.viewModel.breakdowns;
		let matchingIndex = -1;
		if (breakdowns.length === 0) {
			this.breakdownsList.splice(0, 0, breakdowns);
		} else {
			breakdowns.forEach((breakdown) => {
				const matchIndex = this.getBreakdownListIndex(breakdown);
				if (this.breakdownsList) {
					if (matchIndex === -1) {
						this.breakdownsList.splice(breakdowns.length - 1, 0, [breakdown]);
					} else {
						this.breakdownsList.splice(matchIndex, 1, [breakdown]);
					}
				}
				matchingIndex = matchIndex;
			});
		}

		if (this.breakdownsListFocusIndex !== undefined) {
			this.breakdownsList.setFocus([this.breakdownsListFocusIndex]);
		} else if (matchingIndex !== -1) {
			this.breakdownsList.setFocus([matchingIndex]);
		}

		this.breakdownsList.rerender();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

		this.resultWrapper = $('.resultWrapper', { tabIndex: 0 });
		this.scrollableElement = this._register(new DomScrollableElement(
			this.resultWrapper,
			{
				alwaysConsumeMouseWheel: true,
				horizontal: ScrollbarVisibility.Hidden,
				vertical: ScrollbarVisibility.Visible
			}
		));
		const scrollableElementNode = this.scrollableElement.getDomNode();
		dom.append(this.container, scrollableElementNode);
		this.responseWrapper = dom.append(this.resultWrapper, $('.responseWrapper'));

		this.onDidChangeItems();
	}

	private onDidChangeItems(): void {

		if (this.viewModel?.status !== AideProbeStatus.IN_PROGRESS) {
			// render results
		} else {
			this.renderFinalAnswer();
		}

		if (this.dimensions) {
			this.layoutBody(this.dimensions.height, this.dimensions.width);
		}
	}

	private renderFinalAnswer(): void {
		dom.clearNode(this.responseWrapper);
		if (this.viewModel?.model.response?.result) {
			const result = this.viewModel.model.response.result;
			this.responseWrapper.appendChild(this.markdownRenderer.render(result).element);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		this.breakdownsList?.rerender();
		this.planList?.rerender();
		super.layoutBody(height, width);
		this.dimensions = { width, height };
		this.scrollableElement.scanDomNode();
	}
}



interface IInitialSymbolInformationTemplateData {
	currentItem?: IAideProbeInitialSymbolsViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IInitialSymbolInformationHeightChangeParams {
	element: IAideProbeInitialSymbolsViewModel;
	index: number;
	height: number;
}

class PlanListRenderer extends Disposable implements IListRenderer<IAideProbeInitialSymbolsViewModel, IInitialSymbolInformationTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IInitialSymbolInformationHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IInitialSymbolInformationHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();
	}

	get templateId(): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IInitialSymbolInformationTemplateData {
		const data: IInitialSymbolInformationTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.edits-list-item'));
		return data;
	}


	renderElement(element: IAideProbeInitialSymbolsViewModel, index: number, templateData: IInitialSymbolInformationTemplateData) {
		//const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, symbolName, thinking } = element;

		const themeIconClasses = ThemeIcon.asCSSSelector(SymbolKinds.toIcon(SymbolKind.Method));
		const iconElement = $(`.plan-icon${themeIconClasses}`);
		templateData.container.appendChild(iconElement);

		const symbolElement = $('.plan-symbol');
		templateData.container.appendChild(symbolElement);

		const symbolHeader = $('.plan-symbol-header');
		symbolHeader.textContent = symbolName;
		symbolElement.appendChild(symbolHeader);

		const symbolPath = $('.plan-symbol-path');
		const workspaceFolder = this.contextService.getWorkspace().folders[0];
		const workspaceFolderUri = workspaceFolder.uri;
		const path = relativePath(workspaceFolderUri, uri);
		if (path) {
			symbolPath.textContent = path.toString();
			symbolElement.appendChild(symbolPath);
		}

		if (thinking) {
			const thinkingElement = $('.plan-thinking');
			thinkingElement.textContent = thinking;
			symbolElement.appendChild(thinkingElement);
		}

		this.updateItemHeight(templateData);
	}

	disposeTemplate(templateData: IInitialSymbolInformationTemplateData): void {
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IInitialSymbolInformationTemplateData): void {
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

class PlanListDelegate implements IListVirtualDelegate<IInitialSymbolInformationTemplateData> {
	private defaultElementHeight: number = 52;

	getHeight(element: IInitialSymbolInformationTemplateData): number {
		return this.defaultElementHeight;
	}

	getTemplateId(element: IInitialSymbolInformationTemplateData): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IInitialSymbolInformationTemplateData): boolean {
		return true;
	}
}


interface IListChangeEvent {
	index: number;
	element: IAideProbeBreakdownViewModel | IAideProbeInitialSymbolsViewModel;
}


interface IBreakdownTemplateData {
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

// const dummyReason = new MarkdownString('This is a dummy response, in order to debug this shit. Gotta remember to remove this.');

class BreakdownListRenderer extends Disposable implements IListRenderer<IAideProbeBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownListRenderer';

	private readonly markdownRenderer: MarkdownRenderer;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
	}

	get templateId(): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IBreakdownTemplateData {
		const data: IBreakdownTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.edits-list-item'));
		return data;
	}


	renderElement(element: IAideProbeBreakdownViewModel, index: number, templateData: IBreakdownTemplateData): void {
		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name, response, expanded } = element;

		const initialIconClasses = ThemeIcon.asClassNameArray(SymbolKinds.toIcon(SymbolKind.Method));
		const iconElement = $('.plan-icon');
		iconElement.classList.add(...initialIconClasses);
		templateData.container.appendChild(iconElement);

		const symbolElement = $('.plan-symbol');
		templateData.container.appendChild(symbolElement);

		const symbolHeader = $('.plan-symbol-header');
		symbolHeader.textContent = name;
		symbolElement.appendChild(symbolHeader);

		const symbolPath = $('.plan-symbol-path');
		const workspaceFolder = this.contextService.getWorkspace().folders[0];
		const workspaceFolderUri = workspaceFolder.uri;
		const path = relativePath(workspaceFolderUri, uri);
		if (path) {
			symbolPath.textContent = path.toString();
			symbolElement.appendChild(symbolPath);
		}

		if (response && expanded) {
			const responseElement = $('.plan-response');
			const markdownResult = this.markdownRenderer.render(response);
			responseElement.appendChild(markdownResult.element);
			symbolElement.appendChild(responseElement);
		}


		element.symbol.then(symbol => {
			if (symbol && symbol.kind) {
				const resolvedIconSelector = ThemeIcon.asClassNameArray(SymbolKinds.toIcon(symbol.kind));
				iconElement.classList.remove(...initialIconClasses);
				iconElement.classList.add(...resolvedIconSelector);
			}
		});

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

class BreakdownListDelegate implements IListVirtualDelegate<IAideProbeBreakdownViewModel> {
	private defaultElementHeight: number = 52;

	getHeight(element: IAideProbeBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideProbeBreakdownViewModel): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeBreakdownViewModel): boolean {
		return true;
	}
}
