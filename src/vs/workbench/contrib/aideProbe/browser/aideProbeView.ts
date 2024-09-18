/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IListMouseEvent, IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { relativePath } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { SymbolKind, SymbolKinds } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenEvent, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Heroicon } from '../../../../workbench/browser/heroicon.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { AideReferencesContentPart, IAideFollowupContentReference, IAideReferenceFoundContentReference } from '../../../../workbench/contrib/aideProbe/browser/aideFollowupReferencesContentPart.js';
import { IAideProbeExplanationService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeExplanations.js';
import { IAideProbeModel } from '../../../../workbench/contrib/aideProbe/browser/aideProbeModel.js';
import { IAideProbeService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeService.js';
import { AideProbeViewModel, IAideFollowupsViewModel, IAideProbeBreakdownViewModel, IAideProbeInitialSymbolsViewModel, IAideProbeListItem, IAideReferencesFoundViewModel, IAideRelevantReferencesViewModel, isBreakdownVM, isFollowupsVM, isInitialSymbolsVM, isReferenceFoundVM, isRelevantReferencesVM } from '../../../../workbench/contrib/aideProbe/browser/aideProbeViewModel.js';
import { AideProbeStatus } from '../../../../workbench/contrib/aideProbe/common/aideProbe.js';
import { ChatMarkdownRenderer } from '../../chat/browser/chatMarkdownRenderer.js';
import './media/aideProbe.css';
import './media/aideProbeExplanationWidget.css';

const $ = dom.$;

const welcomeActions = [
	{
		title: 'AI editing', actionId: 'workbench.action.aideProbe.focus', children: [
			{ title: 'Anchored editing', descrption: 'Select a code range and quickly iterate over it.' },
			{ title: 'Agentic editing', flag: 'beta', descrption: 'Kick off tasks without providing a focus area. Takes a bit longer.' },
		],
	},
	{ title: 'Toggle editing mode', actionId: 'workbench.action.aideProbe.toggleMode', descrption: 'Switch between anchored and agentic editing modes.' },
	{ title: 'Add context', actionId: 'workbench.action.aideControls.attachContext', descrption: 'Provide files as context to both agentic or anchored editing' },
	{ title: 'Toggle AST Navigation', actionId: 'astNavigation.toggleMode', descrption: 'Quickly navigate through semantic blocks of code.' }
];

// const fakeFollowups: Map<string, IAideFollowupViewModel[]> = new Map();
//
// fakeFollowups.set('reason 1', [
// 	{ reference: { name: 'symbol', uri: URI.parse('path/to/file') }, state: 'idle' },
// 	{ reference: { name: 'anotherSymbol', uri: URI.parse('path/to/another/file') }, state: 'loading' },
// 	{ reference: { name: 'yetOneMoreSymbol', uri: URI.parse('path/to/yet/another/file') }, state: 'complete' },
// ]);
//
// fakeFollowups.set('reason 2', [
// 	{ reference: { name: 'symbol', uri: URI.parse('path/to/yet/another/file') }, state: 'idle' },
// 	{ reference: { name: 'anotherSymbol', uri: URI.parse('path/to/yet/another/file') }, state: 'loading' },
// 	{ reference: { name: 'yetOneMoreSymbol', uri: URI.parse('path/to/one/final/file') }, state: 'complete' },
// ]);
//
// const followupsVMMock: IAideFollowupsViewModel = {
// 	type: 'followups',
// 	followups: fakeFollowups,
// 	index: undefined,
// 	currentRenderedHeight: undefined,
// 	expanded: false
// };

export class AideProbeViewPane extends ViewPane {
	private currentView: 'welcome' | 'list' = 'welcome';

	private container!: HTMLElement;
	private resultWrapper!: HTMLElement;
	private responseWrapper!: HTMLElement;
	private scrollableElement!: DomScrollableElement;
	private dimensions!: IDimension;

	private model: IAideProbeModel | undefined;
	private viewModel: AideProbeViewModel | undefined;

	private welcomeElement!: HTMLElement;

	listFocusIndex: number | undefined;
	private listHeader: HTMLElement | undefined;
	private list: WorkbenchList<IAideProbeListItem> | undefined;

	private readonly _onDidChangeFocus = this._register(new Emitter<IListChangeEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly markdownRenderer: ChatMarkdownRenderer;
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
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService hoverService: IHoverService,
		@IAideProbeExplanationService private readonly explanationService: IAideProbeExplanationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.markdownRenderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));

		this.init();
		this._register(aideProbeService.onNewSession(() => {
			this.model = undefined;
			this.viewModelDisposables.clear();
			this.init();
		}));
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
				this.updateList();
			}));
		}
	}

	// TODO(@g-danna) Use built-in welcome APIs?
	private createWelcome(parent: HTMLElement) {
		const element = this.welcomeElement = $('.aide-welcome');
		parent.appendChild(element);
		const header = $('.list-header');
		this._register(this.instantiationService.createInstance(Heroicon, header, 'micro/bolt'));
		const headerText = $('.header-text');
		headerText.textContent = 'Welcome to Aide';
		header.appendChild(headerText);
		element.appendChild(header);

		const listContainer = $('.list-container');
		element.appendChild(listContainer);

		for (const welcomeItem of welcomeActions) {
			const button = this.renderListItem(welcomeItem, listContainer);
			if (welcomeItem.children) {
				const childrenList = $('.welcome-children-list');
				button.element.appendChild(childrenList);
				for (const child of welcomeItem.children) {
					this.renderListItem(child, childrenList);
				}
			}
		}
		return element;
	}

	private renderListItem(welcomeItem: any, listContainer: HTMLElement) {
		const button = this._register(this.instantiationService.createInstance(Button, listContainer, { title: welcomeItem.title }));

		const header = $('.welcome-item-header');

		const title = $('.welcome-item-title');
		title.textContent = welcomeItem.title;
		header.appendChild(title);

		if (welcomeItem.flag) {
			const flag = $('.flag-tag');
			flag.textContent = welcomeItem.flag;
			title.appendChild(flag);
		}

		const kb = this.keybindingService.lookupKeybinding(welcomeItem.actionId, this.contextKeyService);
		if (kb) {
			const k = this._register(new KeybindingLabel($('div'), OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
			k.set(kb);
			if (k.element) {
				header.appendChild(k.element);
			}
		}

		button.element.appendChild(header);

		if (welcomeItem.descrption) {
			const description = $('.welcome-item-description');
			description.textContent = welcomeItem.descrption;
			button.element.appendChild(description);
		}

		this._register(button.onDidClick(() => {
			if (welcomeItem.actionId) {
				this.commandService.executeCommand(welcomeItem.actionId);
			}
		}));

		return button;
	}

	private showList() {
		dom.hide(this.welcomeElement);
		dom.show(this.responseWrapper);
		this.currentView = 'list';
	}

	showWelcome() {
		dom.show(this.welcomeElement);
		dom.hide(this.responseWrapper);
		this.currentView = 'welcome';
	}

	private createList() {
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
		if (!this.listHeader) {
			const header = this.listHeader = $('.list-header');
			this._register(scopedInstantiationService.createInstance(Heroicon, header, 'micro/list-bullet'));
			const headerText = $('.header-text');
			headerText.textContent = 'Plan';
			header.appendChild(headerText);
			this.responseWrapper.append(header);
		}

		const listDelegate = scopedInstantiationService.createInstance(ProbeListDelegate);
		const renderer = this._register(scopedInstantiationService.createInstance(ProbeListRenderer, this.onDidChangeVisibility, this.markdownRenderer));
		const listContainer = $('.list-container');
		this.responseWrapper.append(listContainer);

		const list = this._register(<WorkbenchList<IAideProbeListItem>>scopedInstantiationService.createInstance(
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

		list.layout(this.dimensions?.height - 36);
		this._register(renderer.onDidChangeItemHeight(event => {
			list.updateElementHeight(event.index, event.height);
		}));
		this._register(list.onDidChangeFocus(event => {
			if (event.indexes.length === 1) {
				const index = event.indexes[0];
				list.setSelection([index]);
				const element = list.element(index);
				if (element.type === 'breakdown' || element.type === 'initialSymbol') {
					this._onDidChangeFocus.fire({ index, element });

					if (event.browserEvent && element && element.uri) {
						this.listFocusIndex = index;
						this.openListItemReference(element, !!event.browserEvent);
					}
				}
			}
		}));

		this._register(list.onKeyDown((e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.DownArrow) && this.listFocusIndex === list.length - 1) {
				this.list?.setFocus([]);
				this.list?.setSelection([]);
			}
		}));

		//this._register(list.onMouseDown((event) => {
		//	this.onOpen(event);
		//}));

		this._register(list.onDidOpen((event) => {
			this.onOpen(event);
		}));

		return list;
	}

	private onOpen(event: IOpenEvent<IAideProbeListItem | undefined> | IListMouseEvent<IAideProbeListItem>) {
		const { element } = event;
		if (element && (element.type === 'breakdown' || element.type === 'initialSymbol')) {
			let index = this.getListIndex(element);
			if (Boolean(this.viewModel?.referencesFound)) {
				// Account for references found occupying the first slot
				index += 1;
			}
			if (event.browserEvent) {
				this.listFocusIndex = index;
			}

			element.expanded = !element.expanded;
			if (this.list) {
				this.list.splice(index, 1, [element]);
				this.list.rerender();
			}
			this._onDidChangeFocus.fire({ index, element: element });
			console.log('will openListItemReference');
			this.openListItemReference(element, !!event.browserEvent);
		}
	}

	private getListIndex(element: IAideProbeListItem): number {
		let matchIndex = -1;
		if (isInitialSymbolsVM(element)) {
			this.viewModel?.initialSymbols.forEach((item, index) => {
				if (item.uri.fsPath === element.uri.fsPath && item.symbolName === element.symbolName) {
					matchIndex = index;
				}
			});
		} else if (isBreakdownVM(element)) {
			this.viewModel?.breakdowns.forEach((item, index) => {
				if (item.uri.fsPath === element.uri.fsPath && item.name === element.name) {
					matchIndex = index;
				}
			});
		}
		return matchIndex;
	}

	async openListItemReference(element: IAideProbeListItem, setFocus: boolean = false): Promise<void> {
		const index = this.getListIndex(element);

		if (this.list && index !== -1 && setFocus) {
			this.list.setFocus([index]);
			if (element.type === 'breakdown') {
				this.explanationService.changeActiveBreakdown(element);
			} else if (element.type === 'initialSymbol') {
				this.explanationService.displayInitialSymbol(element);
			}
		}
	}

	private updateList() {
		if (!this.list && (this.viewModel?.initialSymbols.length || this.viewModel?.breakdowns.length)) {
			this.list = this.createList();
		}

		if (this.currentView !== 'list') {
			this.showList();
		}

		if (!this.viewModel || !this.list) {
			return;
		}

		const items: (IAideProbeInitialSymbolsViewModel | IAideProbeBreakdownViewModel | IAideReferencesFoundViewModel | IAideRelevantReferencesViewModel | IAideFollowupsViewModel)[] = [...this.viewModel.initialSymbols, ...this.viewModel.breakdowns];

		// Make sure referencesFound is always the first item
		if (this.viewModel.referencesFound) {
			items.unshift(this.viewModel.referencesFound);
		}

		const hasFollowups = this.viewModel.followups?.followups?.size ?? 0 > 0;

		// Make sure relevantReferences is always the last item
		if (this.viewModel.relevantReferences && !hasFollowups) {
			items.push(this.viewModel.relevantReferences);
		}
		if (hasFollowups && this.viewModel.followups) {
			items.push(this.viewModel.followups);
		}

		let matchingIndex = -1;

		if (items.length === 0) {
			this.list.splice(0, this.list.length, items);
		} else {
			items.forEach((item, index) => {
				item.index = index;

				// Account for references found occupying the first slot
				const hasReferencesFound = Boolean(this.viewModel?.referencesFound);
				let matchIndex = -1;

				if (isReferenceFoundVM(item)) {
					matchIndex = 0;
				}

				if (isInitialSymbolsVM(item) || isBreakdownVM(item)) {
					matchIndex = this.getListIndex(item);
					if (hasReferencesFound) {
						matchIndex = + 1;
					}
				}


				if (isRelevantReferencesVM(item) || isFollowupsVM(item)) {
					matchIndex = items.length - 1;
				}

				if (this.list) {
					if (matchIndex === -1) {
						// it's -2 instead of -1 because I'm appending a mock followupsVMMock
						this.list.splice(items.length - 2, 0, [item]);
					} else {
						if (matchIndex === this.listFocusIndex) {
							item.expanded = true;
						}
						const hasOneBreakdownEntry = hasReferencesFound ? items.length === 2 : items.length === 1;
						if (hasOneBreakdownEntry) {
							item.expanded = true;
						}
						this.list.splice(matchIndex, 1, [item]);
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

		this.list.rerender();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

		this.welcomeElement = this.createWelcome(this.container);

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

	clear(showWelcome = true): void {
		this.list?.splice(0, this.list.length);
		this.list?.rerender();
		this.list?.layout(0, this.dimensions?.width);
		this.list?.dispose();
		this.list = undefined;
		if (showWelcome) {
			this.showWelcome();
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
		super.layoutBody(height, width);
		this.dimensions = { width, height };
		this.list?.layout(this.dimensions.height - 36);
		this.list?.rerender();
		this.scrollableElement.scanDomNode();
	}
}

interface IAideProbeListItemTemplate {
	currentItem?: IAideProbeListItem;
	currentItemIndex?: number;
	container: HTMLElement;
	toDispose: DisposableStore;
}

interface IProbeListItemHeightChangeParams {
	element: IAideProbeListItem;
	index: number;
	height: number;
}

interface IListChangeEvent {
	index: number;
	element: IAideProbeListItem;
}

class ProbeListRenderer extends Disposable implements IListRenderer<IAideProbeListItem, IAideProbeListItemTemplate> {
	static readonly TEMPLATE_ID = 'probeListRenderer';

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IProbeListItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IProbeListItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly _onDidChangeVisibility: Event<boolean>,
		private readonly markdownRenderer: ChatMarkdownRenderer,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();
	}

	get templateId(): string {
		return ProbeListRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IAideProbeListItemTemplate {
		const data: IAideProbeListItemTemplate = Object.create(null);
		data.toDispose = this._register(new DisposableStore());
		data.container = dom.append(container, $('.edits-list-item'));
		return data;
	}

	renderElement(element: IAideProbeListItem, index: number, templateData: IAideProbeListItemTemplate) {
		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		switch (element.type) {
			case 'initialSymbol':
				this.renderInitialSymbol(element, templateData);
				break;
			case 'breakdown':
				this.renderBreakdown(element, templateData);
				break;
			case 'referencesFound':
				this.renderReferenceFound(element, templateData);
				break;
			case 'relevantReferences':
				this.renderRelevantReferences(element, templateData);
				break;
			case 'followups':
				this.renderFollowups(element, templateData);
				break;
		}
		this.updateItemHeight(templateData);
	}

	private renderInitialSymbol(element: IAideProbeInitialSymbolsViewModel, templateData: IAideProbeListItemTemplate): void {
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
	}

	private renderBreakdown(element: IAideProbeBreakdownViewModel, templateData: IAideProbeListItemTemplate): void {
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
	}

	private renderReferenceFound(element: IAideReferencesFoundViewModel, templateData: IAideProbeListItemTemplate): void {
		const iconElement = $('.plan-icon');
		this.instantiationService.createInstance(Heroicon, iconElement, 'micro/code-bracket');
		templateData.container.appendChild(iconElement);

		const symbolElement = $('.plan-symbol');
		templateData.container.appendChild(symbolElement);

		const symbolHeader = $('.plan-symbol-header');
		symbolHeader.textContent = 'References';
		symbolElement.appendChild(symbolHeader);

		const references = Object.values(element.references).map(ref => ({ kind: 'found-reference', reference: ref.uri, occurencies: ref.occurencies })) as IAideReferenceFoundContentReference[];

		const label = Object.keys(references).length > 1
			? localize('usedFoundReferencesReferencesPlural', "{0} files contain references to these symbols", references.length)
			: localize('usedFoundReferencesReferencesSingular', "{0} file contains references to these symbols ", 1);


		const referencesPart = this.instantiationService.createInstance(AideReferencesContentPart, references, label, false, this._onDidChangeVisibility);
		if (!element.toDispose || element.toDispose.isDisposed) {
			element.toDispose = new DisposableStore();
		}
		templateData.toDispose.add(referencesPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		symbolElement.appendChild(referencesPart.domNode);
	}

	renderRelevantReferences(element: IAideRelevantReferencesViewModel, templateData: IAideProbeListItemTemplate): void {

		const iconElement = $('.plan-icon');
		this.instantiationService.createInstance(Heroicon, iconElement, 'micro/cog-6-tooth');
		templateData.container.appendChild(iconElement);

		const symbolElement = $('.plan-symbol');
		templateData.container.appendChild(symbolElement);

		const symbolHeader = $('.plan-symbol-header');
		symbolHeader.textContent = 'Relevant references';
		symbolElement.appendChild(symbolHeader);

		const references = Object.values(element.references).map(ref => ({ kind: 'found-reference', reference: ref.uri, occurencies: ref.occurencies })) as IAideReferenceFoundContentReference[];

		const label = Object.keys(references).length > 1
			? localize('usedFoundReferencesReferencesPlural', "{0} files contain references to these symbols", references.length)
			: localize('usedFoundReferencesReferencesSingular', "{0} file contains references to these symbols ", 1);


		const referencesPart = this.instantiationService.createInstance(AideReferencesContentPart, references, label, false, this._onDidChangeVisibility);
		if (!element.toDispose || element.toDispose.isDisposed) {
			element.toDispose = new DisposableStore();
		}
		templateData.toDispose.add(referencesPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		symbolElement.appendChild(referencesPart.domNode);
	}

	private renderFollowups(element: IAideFollowupsViewModel, templateData: IAideProbeListItemTemplate): void {
		const { followups } = element;

		const iconElement = $('.plan-icon');
		this._register(this.instantiationService.createInstance(Heroicon, iconElement, 'micro/cog-6-tooth'));
		templateData.container.appendChild(iconElement);

		const symbolElement = $('.plan-symbol');
		templateData.container.appendChild(symbolElement);

		const symbolHeader = $('.plan-symbol-header');
		symbolHeader.textContent = 'Followups';
		symbolElement.appendChild(symbolHeader);

		let index = 0;

		if (!element.toDispose || element.toDispose.isDisposed) {
			element.toDispose = new DisposableStore();
		}

		for (const [reason, followup] of followups.entries()) {
			const reasonElement = $('.followup-response');
			if (index === 0) {
				reasonElement.classList.add('first-response');
			}
			reasonElement.textContent = reason;
			symbolElement.appendChild(reasonElement);

			const references = followup.map(ref => ({ kind: 'followup-reference', reference: ref.reference.uri })) as IAideFollowupContentReference[];

			const label = followup.length > 1
				? localize('usedFollowupsReferencesPlural', "Affects {0} references", followup.length)
				: localize('usedFollowupsReferencesSingular', "Affects {0} reference", 1);


			const referencesPart = this.instantiationService.createInstance(AideReferencesContentPart, references, label, false, this._onDidChangeVisibility);

			const countCompleted = references.reduce((count, obj) =>
				obj.state === 'complete' ? count + 1 : count, 0);
			if (countCompleted > 0) {
				referencesPart.updateLoading(countCompleted / references.length * 100);
			}
			element.toDispose.add(referencesPart);

			element.toDispose.add(referencesPart);
			templateData.toDispose.add(referencesPart.onDidChangeHeight(() => {
				this.updateItemHeight(templateData);
			}));
			symbolElement.appendChild(referencesPart.domNode);
			index++;
		}

		const followupsButton = this.instantiationService.createInstance(Button, symbolElement, { title: 'Fix all', ...defaultButtonStyles });
		element.toDispose.add(followupsButton);
		followupsButton.element.classList.add('fix-all-button');
		followupsButton.element.textContent = 'Fix all';
		element.toDispose.add(followupsButton.onDidClick(() => {
			this.commandService.executeCommand('workbench.action.aideProbe.followups');
		}));
	}

	disposeElement(element: IAideProbeListItem, index: number): void {
		if (element.type === 'followups' || element.type === 'relevantReferences' || element.type === 'referencesFound') {
			element.toDispose?.dispose();
		}
	}

	disposeTemplate(templateData: IAideProbeListItemTemplate): void {
		console.log('disposing template');
		dispose(templateData.toDispose);
	}

	private updateItemHeight(templateData: IAideProbeListItemTemplate): void {
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

class ProbeListDelegate implements IListVirtualDelegate<IAideProbeListItem> {
	private defaultElementHeight: number = 52;

	getHeight(element: IAideProbeListItem): number {
		return this.defaultElementHeight;
	}

	getTemplateId(element: IAideProbeListItem): string {
		return ProbeListRenderer.TEMPLATE_ID;
	}

	hasDynamicHeight(element: IAideProbeListItem): boolean {
		return true;
	}
}
