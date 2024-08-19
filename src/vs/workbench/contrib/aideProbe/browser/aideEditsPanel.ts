/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { AidePanel } from 'vs/workbench/contrib/aideProbe/browser/aidePanel';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideProbeModel, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose, IReference } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { IAideProbeBreakdownContent, IAideProbeInitialSymbolInformation } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { HunkInformation } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { Range } from 'vs/editor/common/core/range';
import { DocumentSymbol, SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { relativePath } from 'vs/base/common/resources';
import { Heroicon } from 'vs/workbench/browser/heroicon';
import { ThemeIcon } from 'vs/base/common/themables';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Button } from 'vs/base/browser/ui/button/button';
import 'vs/css!./media/aideEditsPanel';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

const $ = dom.$;

export const IAideEditsService = createDecorator<IAideEditsService>('IAideEditsService');

export interface IAideEditsService {
	_serviceBrand: undefined;
	registerPanel(panel: AideEditsPanel): void;
	openPanel(): void;
	closePanel(): void;
}

export class AideEditsService implements IAideEditsService {
	_serviceBrand: undefined;
	private panel: AideEditsPanel | undefined;

	registerPanel(panel: AideEditsPanel): void {
		if (!this.panel) {
			this.panel = panel;
		} else {
			console.warn('AideEditsPanel already registered');
		}
	}

	openPanel(): void {
		if (this.panel) {
			this.panel.show();
		}
	}

	closePanel(): void {
		if (this.panel) {
			this.panel.hide();
		}
	}
}

registerSingleton(IAideEditsService, AideEditsService, InstantiationType.Eager);

export class AideEditsPanel extends AidePanel {

	static readonly ID = 'workbench.contrib.aideEditsPanel';

	private model: IAideProbeModel | undefined;
	private viewModel: IAideEditsViewModel | undefined;
	private readonly viewModelDisposables = this._register(new DisposableStore());

	planListFocusIndex: number | undefined;
	private activePlanEntry: IAideInitialSymbolInformationViewModel | undefined;
	private planList: WorkbenchList<IAideInitialSymbolInformationViewModel> | undefined;

	breakdownsListFocusIndex: number | undefined;
	private activeBreakdown: IAideBreakdownViewModel | undefined;
	private breakdownsList: WorkbenchList<IAideBreakdownViewModel> | undefined;


	private readonly _onDidChangeFocus = this._register(new Emitter<IListChangeEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	constructor(
		private readonly button: Button,
		reference: HTMLElement,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IAideEditsService aideEditsService: IAideEditsService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super(reference, instantiationService, undefined, 'Actions');

		aideEditsService.registerPanel(this);

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
			this.button.enabled = true;
			this.viewModel = this.instantiationService.createInstance(AideEditsViewModel, this.model);
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
		this.body.element.append(header);

		const listDelegate = this.instantiationService.createInstance(PlanListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(PlanListRenderer));
		const listContainer = $('.list-container');
		this.body.element.append(listContainer);

		const list = this._register(<WorkbenchList<IAideInitialSymbolInformationViewModel>>this.instantiationService.createInstance(
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
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);

				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					this.breakdownsListFocusIndex = index;
				}

				if (element && element.uri && element.symbolName) {
					this.openPlanReference(element, !!event.browserEvent);
				}
			}
		}));

		this._register(list.onDidOpen(async (event) => {
			const { element } = event;
			if (element && element.uri && element.symbolName) {
				const index = this.getPlanListIndex(element);

				if (event.browserEvent) {
					this.breakdownsListFocusIndex = index;
				}

				this._onDidChangeFocus.fire({ index, element: element });
				this.openPlanReference(element, !!event.browserEvent);
			}
		}));


		this._register(this.onDidResize(() => {
			list.rerender();
		}));

		return list;
	}

	private getPlanListIndex(element: IAideInitialSymbolInformationViewModel): number {
		let matchIndex = -1;
		this.viewModel?.initialSymbols.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.symbolName === element.symbolName) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openPlanReference(element: IAideInitialSymbolInformationViewModel, setFocus: boolean = false): Promise<void> {
		if (this.activePlanEntry === element) {
			return;
		} else {
			this.activePlanEntry = element;
			const index = this.getPlanListIndex(element);
			if (this.planList && index !== -1 && setFocus) {
				this.planList.setFocus([index]);
				//this.explanationService.changeActiveBreakdown(element);
			}
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
		this.body.element.append(header);


		const listDelegate = this.instantiationService.createInstance(BreakdownListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(BreakdownListRenderer));
		const listContainer = $('.breakdown-list-container');
		this.body.element.append(listContainer);

		const list = this._register(<WorkbenchList<IAideBreakdownViewModel>>this.instantiationService.createInstance(
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
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);


				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent) {
					this.breakdownsListFocusIndex = index;
				}

				if (element && element.uri && element.name) {
					this.openBreakdownReference(element, !!event.browserEvent);
				}
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
				this.openBreakdownReference(element, !!event.browserEvent);
			}
		}));

		this._register(this.onDidResize(() => {
			list.rerender();
		}));

		return list;
	}

	private getBreakdownListIndex(element: IAideBreakdownViewModel): number {
		let matchIndex = -1;
		this.viewModel?.breakdowns.forEach((item, index) => {
			if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
				matchIndex = index;
			}
		});
		return matchIndex;
	}

	async openBreakdownReference(element: IAideBreakdownViewModel, setFocus: boolean = false): Promise<void> {
		if (this.activeBreakdown === element) {
			return;
		} else {
			this.activeBreakdown = element;
			const index = this.getBreakdownListIndex(element);
			if (this.breakdownsList && index !== -1 && setFocus) {
				this.breakdownsList.setFocus([index]);
				this.explanationService.changeActiveBreakdown(element);
			}
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
}


interface IInitialSymbolInformationTemplateData {
	currentItem?: IAideInitialSymbolInformationViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IInitialSymbolInformationHeightChangeParams {
	element: IAideInitialSymbolInformationViewModel;
	index: number;
	height: number;
}

class PlanListRenderer extends Disposable implements IListRenderer<IAideInitialSymbolInformationViewModel, IInitialSymbolInformationTemplateData> {
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


	renderElement(element: IAideInitialSymbolInformationViewModel, index: number, templateData: IInitialSymbolInformationTemplateData) {
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
	element: IAideBreakdownViewModel | IAideInitialSymbolInformationViewModel;
}


interface IBreakdownTemplateData {
	currentItem?: IAideBreakdownViewModel;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideBreakdownViewModel;
	index: number;
	height: number;
}

const dummyReason = new MarkdownString('This is a dummy response, in order to debug this shit. Gotta remember to remove this.');

class BreakdownListRenderer extends Disposable implements IListRenderer<IAideBreakdownViewModel, IBreakdownTemplateData> {
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


	renderElement(element: IAideBreakdownViewModel, index: number, templateData: IBreakdownTemplateData): void {
		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name, response = dummyReason, expanded } = element;

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

class BreakdownListDelegate implements IListVirtualDelegate<IAideBreakdownViewModel> {
	private defaultElementHeight: number = 52;

	getHeight(element: IAideBreakdownViewModel): number {
		return (element.currentRenderedHeight ?? this.defaultElementHeight);
	}

	getTemplateId(element: IAideBreakdownViewModel): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideBreakdownViewModel): boolean {
		return true;
	}
}



export interface IAideEditsViewModel {
	readonly onDidChange: Event<void>;
	readonly onChangeActiveBreakdown: Event<IAideBreakdownViewModel>;
	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly status: IAideProbeStatus;
	readonly initialSymbols: ReadonlyArray<IAideInitialSymbolInformationViewModel>;
	readonly breakdowns: ReadonlyArray<IAideBreakdownViewModel>;
}

class AideEditsViewModel extends Disposable implements IAideEditsViewModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onChangeActiveBreakdown = this._register(new Emitter<IAideBreakdownViewModel>());
	readonly onChangeActiveBreakdown = this._onChangeActiveBreakdown.event;

	private _references: Map<string, IReference<IResolvedTextEditorModel>> = new Map();

	get model(): IAideProbeModel {
		return this._model;
	}

	get sessionId(): string {
		return this._model.sessionId;
	}

	get status(): IAideProbeStatus {
		return this._model.status;
	}

	private _lastFileOpened: URI | undefined;
	get lastFileOpened(): URI | undefined {
		return this._lastFileOpened;
	}

	private _initialSymbols: IAideInitialSymbolInformationViewModel[] = [];
	get initialSymbols() {
		return this._initialSymbols;
	}

	private _breakdowns: IAideBreakdownViewModel[] = [];
	get breakdowns() {
		return this._breakdowns;
	}

	constructor(
		private readonly _model: IAideProbeModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) {
		super();

		this._register(_model.onDidChange(async () => {
			if (!this._model.response) {
				return;
			}

			this._lastFileOpened = _model.response?.lastFileOpened;

			if (this._model.response.initialSymbols) {
				this._initialSymbols = Array.from(this._model.response.initialSymbols.values()).flat().map(item => ({ ...item, currentRenderedHeight: 0 }));
			}

			//const codeEdits = _model.response?.codeEdits;

			this._breakdowns = await Promise.all(_model.response?.breakdowns.map(async (item) => {
				let reference = this._references.get(item.reference.uri.toString());
				if (!reference) {
					reference = await this.textModelResolverService.createModelReference(item.reference.uri);
				}
				const viewItem = this._register(this.instantiationService.createInstance(AideBreakdownViewModel, item, reference));
				viewItem.symbol.then(symbol => {
					if (!symbol) {
						return;
					}
					//const edits = codeEdits?.get(item.reference.uri.toString());
					//const hunks = edits?.hunkData.getInfo();
					//for (const hunk of hunks ?? []) {
					//	let wholeRange: Range | undefined;
					//	const ranges = hunk.getRangesN();
					//	for (const range of ranges) {
					//		if (!wholeRange) {
					//			wholeRange = range;
					//		} else {
					//			wholeRange = wholeRange.plusRange(range);
					//		}
					//	}
					//	if (wholeRange && Range.areIntersecting(symbol.range, wholeRange)) {
					//		viewItem.appendEdits([hunk]);
					//	}
					//}
					this._onDidChange.fire();
				});
				return viewItem;
			}) ?? []);

			this._onDidChange.fire();
		}));
	}
}

export interface IAideInitialSymbolInformationViewModel extends IAideProbeInitialSymbolInformation {
	currentRenderedHeight: number | undefined;
}

export interface IAideBreakdownViewModel {
	readonly uri: URI;
	readonly name: string;
	readonly query?: IMarkdownString;
	readonly reason?: IMarkdownString;
	readonly response?: IMarkdownString;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	readonly edits: HunkInformation[];
	currentRenderedHeight: number | undefined;
	expanded: boolean;
}

export interface IAideCodeEditPreviewViewModel {
	readonly uri: URI;
	readonly range: Range;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	isRendered: boolean;
}

export class AideBreakdownViewModel extends Disposable implements IAideBreakdownViewModel {
	get uri() {
		return this._breakdown.reference.uri;
	}

	get name() {
		return this._breakdown.reference.name;
	}

	get query() {
		return this._breakdown.query;
	}

	get reason() {
		return this._breakdown.reason;
	}

	get response() {
		return this._breakdown.response;
	}

	expanded = false;

	private _symbolResolver: (() => Promise<DocumentSymbol | undefined>) | undefined;
	private _symbol: DocumentSymbol | undefined;
	get symbol() {
		return this._getSymbol();
	}

	private async _getSymbol(): Promise<DocumentSymbol | undefined> {
		if (!this._symbol && this._symbolResolver) {
			this._symbol = await this._symbolResolver();
		}

		return this._symbol;
	}

	currentRenderedHeight: number | undefined;

	private _edits: HunkInformation[] = [];
	get edits() {
		return this._edits;
	}

	appendEdits(edits: HunkInformation[]) {
		this._edits.push(...edits);
	}

	constructor(
		private readonly _breakdown: IAideProbeBreakdownContent,
		private readonly reference: IReference<IResolvedTextEditorModel>,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
	) {
		super();

		if (_breakdown.reference.uri && _breakdown.reference.name) {
			this._symbolResolver = async () => {
				this._symbol = await this.resolveSymbol();
				return this._symbol;
			};
			this._symbolResolver();
		}
	}

	private async resolveSymbol(): Promise<DocumentSymbol | undefined> {
		try {
			const symbols = (await this.outlineModelService.getOrCreate(this.reference.object.textEditorModel, CancellationToken.None)).getTopLevelSymbols();
			const symbol = symbols.find(s => s.name === this.name);
			if (!symbol) {
				return;
			}

			return symbol;
		} catch (e) {
			return;
		}
	}
}
