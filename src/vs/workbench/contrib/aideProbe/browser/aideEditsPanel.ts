/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { AidePanel } from 'vs/workbench/contrib/aideProbe/browser/aidePanel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideProbeModel, IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose, IReference } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
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
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { FileKind } from 'vs/platform/files/common/files';
import { relativePath } from 'vs/base/common/resources';

const $ = dom.$;

export class AideEditsPanel extends AidePanel {

	static readonly ID = 'workbench.contrib.aideEditsPanel';
	private model: IAideProbeModel | undefined;

	private viewModel: IAideEditsViewModel | undefined;
	private readonly viewModelDisposables = this._register(new DisposableStore());

	listFocusIndex: number | undefined;
	private activeBreakdown: IAideBreakdownViewModel | undefined;
	private list: WorkbenchList<IAideBreakdownViewModel> | undefined;
	private readonly _onDidChangeFocus = this._register(new Emitter<IBreakdownChangeEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	constructor(
		reference: HTMLElement,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super(reference, instantiationService);


		this._register(aideProbeService.onNewEvent((event) => {
			console.log('AideEditsPanel.model.newEvent', event);
			if (!this.model) {
				this.onNewRequest();
			}
		}));
	}

	private onNewRequest() {
		this.model = this.aideProbeService.getSession()!;
		this.viewModel = this.instantiationService.createInstance(AideEditsViewModel, this.model);

		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange)(() => {
			this.updateList();
		}));
	}

	private createList() {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));
		const listDelegate = this.instantiationService.createInstance(BreakdownListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(BreakdownListRenderer, resourceLabels));
		const list = this._register(<WorkbenchList<IAideBreakdownViewModel>>this.instantiationService.createInstance(
			WorkbenchList,
			'BreakdownsList',
			this.body.element,
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
					this.listFocusIndex = index;
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
					this.listFocusIndex = index;
				}

				this._onDidChangeFocus.fire({ index, element: element });
				this.openBreakdownReference(element, !!event.browserEvent);
			}
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
			if (this.list && index !== -1 && setFocus) {
				this.list.setFocus([index]);
				this.explanationService.changeActiveBreakdown(element);
			}
		}
	}

	private updateList() {
		if (!this.list) {
			this.list = this.createList();
			return;
		}
		if (!this.viewModel) {
			return;
		}
		const breakdowns = this.viewModel.breakdowns;
		let matchingIndex = -1;
		if (breakdowns.length === 0) {
			this.list.splice(0, 0, breakdowns);
		} else {
			breakdowns.forEach((breakdown) => {
				const matchIndex = this.getBreakdownListIndex(breakdown);
				if (this.list) {
					if (matchIndex === -1) {
						this.list.splice(breakdowns.length - 1, 0, [breakdown]);
					} else {
						this.list.splice(matchIndex, 1, [breakdown]);
					}
				}
				matchingIndex = matchIndex;
			});
		}

		if (this.listFocusIndex !== undefined) {
			this.list.setFocus([this.listFocusIndex]);
		} else if (matchingIndex !== -1) {
			this.list.setFocus([matchingIndex]);
		}
	}
}

interface IBreakdownChangeEvent {
	index: number;
	element: IAideBreakdownViewModel;
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

class BreakdownListRenderer extends Disposable implements IListRenderer<IAideBreakdownViewModel, IBreakdownTemplateData> {
	static readonly TEMPLATE_ID = 'breakdownListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly resourceLabels: ResourceLabels,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();
	}

	get templateId(): string {
		return BreakdownListRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IBreakdownTemplateData {
		const data: IBreakdownTemplateData = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.edits-breakdown-list-item'));
		return data;
	}


	renderElement(element: IAideBreakdownViewModel, index: number, templateData: IBreakdownTemplateData): void {
		const templateDisposables = new DisposableStore();

		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		const { uri, name } = element;
		if (uri) {
			const rowResource = $('edits-breakdown-list-resource');
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

	private _initialSymbols: ReadonlyMap<string, IAideProbeInitialSymbolInformation[]> | undefined;
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

			this._lastFileOpened = _model.response?.lastFileOpened;




			const codeEdits = _model.response?.codeEdits;

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
					const edits = codeEdits?.get(item.reference.uri.toString());
					const hunks = edits?.hunkData.getInfo();
					for (const hunk of hunks ?? []) {
						let wholeRange: Range | undefined;
						const ranges = hunk.getRangesN();
						for (const range of ranges) {
							if (!wholeRange) {
								wholeRange = range;
							} else {
								wholeRange = wholeRange.plusRange(range);
							}
						}
						if (wholeRange && Range.areIntersecting(symbol.range, wholeRange)) {
							viewItem.appendEdits([hunk]);
						}
					}
					this._onDidChange.fire();
				});
				return viewItem;
			}) ?? []);

			this._onDidChange.fire();
		}));
	}
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
