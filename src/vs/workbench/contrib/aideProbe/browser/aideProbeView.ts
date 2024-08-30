/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Button } from 'vs/base/browser/ui/button/button';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import { relativePath } from 'vs/base/common/resources';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/aideProbe';
import 'vs/css!./media/aideProbeExplanationWidget';
import { IDimension } from 'vs/editor/common/core/dimension';
import { SymbolKind, SymbolKinds } from 'vs/editor/common/languages';
import { ICommandService } from 'vs/platform/commands/common/commands';
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
import { CONTEXT_PROBE_MODE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { IAideProbeListItem, AideProbeViewModel, IAideProbeBreakdownViewModel, IAideProbeInitialSymbolsViewModel, isBreakdownVM, isInitialSymbolsVM } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { AideProbeMode, AideProbeStatus } from 'vs/workbench/contrib/aideProbe/common/aideProbe';

const $ = dom.$;

const welcomeActions = [
	{ title: 'Anchored editing', actionId: 'workbench.action.aideProbe.enterAnchoredEditing', descrption: 'Select a code range and quickly iterate over it.' },
	{ title: 'Agentic editing', flag: 'beta', actionId: 'workbench.action.aideProbe.enterAgenticEditing', descrption: 'Kick off tasks without providing a focus area. Takes a bit longer.' },
	{ title: 'Add context', actionId: 'workbench.action.aideControls.attachContext', descrption: 'Provide files as context to both agentic or anchored editing' },
	{ title: 'Make follow-ups', flag: 'alpha', actionId: 'workbench.action.aideProbe.followups', descrption: 'Automagically fix implementation and references based on new changes in a code range.' },
	{ title: 'Toggle AST Navigation', actionId: 'astNavigation.toggleMode', descrption: 'Quickly navigate through semantic blocks of code.' }
];


export class AideProbeViewPane extends ViewPane {

	static readonly id = 'workbench.aideProbeViewPane';

	private container!: HTMLElement;
	private resultWrapper!: HTMLElement;
	private responseWrapper!: HTMLElement;
	private scrollableElement!: DomScrollableElement;
	private dimensions!: IDimension;

	private model: IAideProbeModel | undefined;
	private viewModel: AideProbeViewModel | undefined;

	private welcomeElement!: HTMLElement;

	listFocusIndex: number | undefined;
	private list: WorkbenchList<IAideProbeListItem> | undefined;

	private readonly _onDidChangeFocus = this._register(new Emitter<IListChangeEvent>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

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

			const description = $('.welcome-item-description');
			description.textContent = welcomeItem.descrption;
			button.element.appendChild(description);

			this._register(button.onDidClick(() => {
				this.commandService.executeCommand(welcomeItem.actionId);
			}));
		}
		return element;
	}

	private showList() {
		dom.hide(this.welcomeElement);
		dom.show(this.responseWrapper);
	}

	showWelcome() {
		dom.show(this.welcomeElement);
		dom.hide(this.responseWrapper);
	}

	private createList() {
		const header = $('.list-header');
		this._register(this.instantiationService.createInstance(Heroicon, header, 'micro/list-bullet'));
		const headerText = $('.header-text');
		headerText.textContent = 'Plan';
		header.appendChild(headerText);
		this.responseWrapper.append(header);

		const listDelegate = this.instantiationService.createInstance(ProbeListDelegate);
		const renderer = this._register(this.instantiationService.createInstance(ProbeListRenderer, this.markdownRenderer));
		const listContainer = $('.list-container');
		this.responseWrapper.append(listContainer);

		const list = this._register(<WorkbenchList<IAideProbeListItem>>this.instantiationService.createInstance(
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

				this._onDidChangeFocus.fire({ index, element });

				if (event.browserEvent && element && element.uri) {
					this.listFocusIndex = index;
					this.openListItemReference(element, !!event.browserEvent);
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

		this._register(list.onDidOpen(async (event) => {
			const { element } = event;
			if (element && element.uri) {
				const index = this.getListIndex(element);

				if (event.browserEvent) {
					this.listFocusIndex = index;
				}

				element.expanded = !element.expanded;
				if (this.list) {
					this.list.splice(index, 1, [element]);
					this.list.rerender();
				}
				this._onDidChangeFocus.fire({ index, element: element });
				this.openListItemReference(element, !!event.browserEvent);
			}
		}));

		return list;
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
			this.showList();
			return;
		}

		if (!this.viewModel || !this.list) {
			return;
		}

		const items = [...this.viewModel.initialSymbols, ...this.viewModel.breakdowns];

		let matchingIndex = -1;

		if (items.length === 0) {
			this.list.splice(0, 0, items);
		} else {
			items.forEach((item, index) => {
				item.index = index;
				const matchIndex = this.getListIndex(item);
				if (this.list) {
					if (matchIndex === -1) {
						this.list.splice(items.length - 1, 0, [item]);
					} else {
						if (matchIndex === this.listFocusIndex) {
							item.expanded = true;
						}
						if (items.length === 1 && CONTEXT_PROBE_MODE.getValue(this.contextKeyService) === AideProbeMode.ANCHORED) {
							item.expanded = true;
						}
						this.list.splice(matchIndex, 1, [item]);
					}
				}
				matchingIndex = matchIndex;
			});
		}

		// isBreakDownVM
		// and we want to rerender just the element with only the element we are focussed
		// right now

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

	clear(): void {
		this.list?.splice(0, this.list.length);
		this.list?.rerender();
		this.list?.layout(0, this.dimensions?.width);
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
		private readonly markdownRenderer: ChatMarkdownRenderer,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();
	}

	get templateId(): string {
		return ProbeListRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): IAideProbeListItemTemplate {
		const data: IAideProbeListItemTemplate = Object.create(null);
		data.toDispose = new DisposableStore();
		data.container = dom.append(container, $('.edits-list-item'));
		return data;
	}

	renderElement(element: IAideProbeListItem, index: number, templateData: IAideProbeListItemTemplate) {
		templateData.currentItem = element;
		templateData.currentItemIndex = index;
		dom.clearNode(templateData.container);

		if (isInitialSymbolsVM(element)) {
			this.renderInitialSymbol(element, templateData);
		} else if (isBreakdownVM(element)) {
			this.renderBreakdown(element, templateData);
		}

		this.updateItemHeight(templateData);
	}

	renderInitialSymbol(element: IAideProbeInitialSymbolsViewModel, templateData: IAideProbeListItemTemplate): void {
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

	renderBreakdown(element: IAideProbeBreakdownViewModel, templateData: IAideProbeListItemTemplate): void {
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

	disposeTemplate(templateData: IAideProbeListItemTemplate): void {
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
