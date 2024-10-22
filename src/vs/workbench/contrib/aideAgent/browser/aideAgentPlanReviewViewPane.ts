/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, Disposable, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors, IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IPlanReviewViewTitleActionContext } from './actions/aideAgentPlanReviewActions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ChatMarkdownRenderer } from './aideAgentMarkdownRenderer.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IAideAgentCodeEditsItem } from '../common/aideAgentService.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ChatMarkdownContentPart, EditorPool } from './aideAgentContentParts/aideAgentMarkdownContentPart.js';
import { DiffEditorPool } from './aideAgentContentParts/aideAgentTextEditContentPart.js';
import { AideAgentCodeEditContentPart, CodeEditsPool } from './aideAgentContentParts/aideAgentCodeEditParts.js';
import { ChatMarkdownDecorationsRenderer } from './aideAgentMarkdownDecorationsRenderer.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IChatCodeEdits, isResponseVM } from '../common/aideAgentViewModel.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { options } from '../../../../base/common/marked/marked.js';
import { IMenuEntryActionViewItemOptions, createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { MarkUnhelpfulActionId } from './actions/aideAgentTitleActions.js';
import { IChatCodeBlockInfo, IChatListItemRendererOptions } from './aideAgent.js';
import { ChatAccessibilityProvider } from './aideAgentAccessibilityProvider.js';
import { ChatPlanStepPart } from './aideAgentContentParts/aideAgentPlanStepPart.js';
import { CollapsibleListPool } from './aideAgentContentParts/aideAgentReferencesContentPart.js';
import { TreePool } from './aideAgentContentParts/aideAgentTreeContentPart.js';
import { ChatVoteDownButton } from './aideAgentListRenderer.js';
import { ChatEditorOptions } from './aideAgentOptions.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

const $ = dom.$;

interface IViewPaneState {
	sessionId?: string;
}

export interface ReviewTreeItem {
	title: string;
	description: MarkdownString;
	id: string;
	exchangeId: string;
	edits: IAideAgentCodeEditsItem[]; // Temporary type
	currentRenderedHeight: number | undefined;
	isComplete: boolean;
	isCanceled: boolean;
}

export const PLAN_REVIEW_PANEL_ID = 'workbench.panel.aideAgentPlanReview';

export class PlanReviewPane extends ViewPane {
	private dimension: IDimension | undefined;

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;

	private tree!: WorkbenchObjectTree<ReviewTreeItem>;
	private renderer!: ReviewListItemRenderer;
	private listContainer!: HTMLElement;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		// Don't know if this is needs to be per exchange id
		this.memento = new Memento('aide-agent-plan-review', this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
	}

	override getActionsContext(): IPlanReviewViewTitleActionContext {
		return {
			planReviewView: this
		};
	}


	protected override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);
			this.listContainer = dom.append(parent, $(`.aide-review-plan-list-container`));
			this.createList(this.listContainer);

			// const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			// const locationBasedColors = this.getLocationBasedColors();

			this._register(this.onDidChangeBodyVisibility(visible => {
				// this._widget.setVisible(visible);
				// Update visibility of children that need to be updated after the widget is visible
			}));

		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		this.dimension = { height, width };
		super.layoutBody(height, width);
	}

	private createList(listContainer: HTMLElement) {
		const scopedInstantiationService = this._register(this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]))));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate, 200);
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			//onDidScroll: this.onDidScroll,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		this.renderer = this._register(scopedInstantiationService.createInstance(
			ReviewListItemRenderer,
			this.editorOptions,
			rendererDelegate,
			this._codeBlockModelCollection,
			overflowWidgetsContainer,
		));

		// editorOptions: ChatEditorOptions,
		// private readonly rendererOptions: IChatListItemRendererOptions,
		// delegate: IChatRendererDelegate,
		// private readonly codeBlockModelCollection: CodeBlockModelCollection,
		// overflowWidgetsDomNode: HTMLElement | undefined,
		// @IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IConfigurationService configService: IConfigurationService,
		// @IContextKeyService private readonly contextKeyService: IContextKeyService,

		//this._register(this.renderer.onDidClickFollowup(item => {
		// is this used anymore?
		// this.acceptInput(item.message);
		//}));
		//this._register(this.renderer.onDidClickRerunWithAgentOrCommandDetection(item => {
		/* TODO(@ghostwriternr): Commenting this out definitely breaks rerunning requests. Fix this.
		const request = this.chatService.getSession(item.sessionId)?.getExchanges().find(candidate => candidate.id === item.requestId);
		if (request) {
			this.chatService.resendRequest(request, { noCommandDetection: true, attempt: request.attempt + 1, location: this.location }).catch(e => this.logService.error('FAILED to rerun request', e));
		}
		*/
		//}));

		this.tree = this._register(<WorkbenchObjectTree<ReviewTreeItem>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'Chat',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: ReviewTreeItem) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: ReviewTreeItem) => e.title }, // TODO
				setRowLineHeight: false,
			}));
		// this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		//this._register(this.tree.onDidChangeContentHeight(() => {
		//	this.onDidChangeTreeContentHeight();
		//}));

		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.tree.updateElementHeight(e.element, e.height);
		}));
		// this._register(this.tree.onDidFocus(() => {
		// 	this._onDidFocus.fire();
		// }));
		// this._register(this.tree.onDidScroll(() => {
		// 	this._onDidScroll.fire();
		// }));
	}

	override saveState(): void {
		// if (this._widget) {
		// 	// Since input history is per-provider, this is handled by a separate service and not the memento here.
		// 	// TODO multiple chat views will overwrite each other
		// 	this._widget.saveState();
		//
		// 	this.updateViewState();
		// 	this.memento.saveMemento();
		// }

		super.saveState();
	}
}

export interface IChatRendererDelegate {
	getListLength(): number;

	readonly onDidScroll?: Event<void>;
}

interface IReviewListItemTemplate {
	currentElement?: ReviewTreeItem;
	readonly rowContainer: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly value: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
}

export interface IPlanReviewContentPartRenderContext {
	element: ReviewTreeItem;
}

interface IItemHeightChangeParams {
	element: ReviewTreeItem;
	height: number;
}


export class ReviewListItemRenderer extends Disposable implements ITreeRenderer<ReviewTreeItem, FuzzyScore, IReviewListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();

	private readonly renderer: MarkdownRenderer;
	private readonly markdownDecorationsRenderer: ChatMarkdownDecorationsRenderer;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly editorOptions: ChatEditorOptions;
	private readonly _editorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _codeEditsPool: CodeEditsPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: CollapsibleListPool;

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		private readonly rendererOptions: IChatListItemRendererOptions,
		delegate: IChatRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
		this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		const locationBasedColors = getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(PLAN_REVIEW_PANEL_ID));
		const styles = {
			listForeground: SIDE_BAR_FOREGROUND,
			listBackground: locationBasedColors.background,
			overlayBackground: locationBasedColors.overlayBackground,
			inputEditorBackground: locationBasedColors.background,
			resultEditorBackground: editorBackground
		}
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, PLAN_REVIEW_PANEL_ID, styles.listForeground, styles.inputEditorBackground, styles.resultEditorBackground));
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, this.editorOptions, delegate, overflowWidgetsDomNode));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, this.editorOptions, delegate, overflowWidgetsDomNode));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event));
		this._codeEditsPool = this._register(this.instantiationService.createInstance(CodeEditsPool, this._onDidChangeVisibility.event));

		this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
	}

	get templateId(): string {
		return ReviewListItemRenderer.ID;
	}

	editorsInUse(): Iterable<CodeBlockPart> {
		return this._editorPool.inUse();
	}

	setVisible(visible: boolean): void {
		this._isVisible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	layout(width: number): void {
		this._currentLayoutWidth = width - (this.rendererOptions.noPadding ? 0 : 40); // padding
		for (const editor of this._editorPool.inUse()) {
			editor.layout(this._currentLayoutWidth);
		}
		for (const diffEditor of this._diffEditorPool.inUse()) {
			diffEditor.layout(this._currentLayoutWidth);
		}
	}

	renderTemplate(container: HTMLElement): IReviewListItemTemplate {
		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.aideagent-item-container'));
		if (this.rendererOptions.renderStyle === 'compact') {
			rowContainer.classList.add('interactive-item-compact');
		}
		if (this.rendererOptions.noPadding) {
			rowContainer.classList.add('no-padding');
		}

		let headerParent = rowContainer;
		let valueParent = rowContainer;
		let detailContainerParent: HTMLElement | undefined;
		let toolbarParent: HTMLElement | undefined;

		if (this.rendererOptions.renderStyle === 'minimal') {
			rowContainer.classList.add('interactive-item-compact');
			rowContainer.classList.add('minimal');
			// -----------------------------------------------------
			//  icon | details
			//       | references
			//       | value
			// -----------------------------------------------------
			const lhsContainer = dom.append(rowContainer, $('.column.left'));
			const rhsContainer = dom.append(rowContainer, $('.column.right'));

			headerParent = lhsContainer;
			detailContainerParent = rhsContainer;
			valueParent = rhsContainer;
			toolbarParent = dom.append(rowContainer, $('.header'));
		}

		const header = dom.append(headerParent, $('.header'));
		const user = dom.append(header, $('.user'));
		user.tabIndex = 0;
		user.role = 'toolbar';
		const username = dom.append(user, $('h3.username'));
		const detailContainer = dom.append(detailContainerParent ?? user, $('span.detail-container'));
		const detail = dom.append(detailContainer, $('span.detail'));
		dom.append(detailContainer, $('span.chat-animated-ellipsis'));
		const value = dom.append(valueParent, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.rendererOptions.noHeader) {
			header.classList.add('hidden');
		} else {
			titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarParent ?? header, MenuId.AideAgentMessageTitle, {
				menuOptions: {
					shouldForwardArgs: true
				},
				toolbarOptions: {
					shouldInlineSubmenu: submenu => submenu.actions.length <= 1
				},
				actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
					if (action instanceof MenuItemAction && action.item.id === MarkUnhelpfulActionId) {
						return scopedInstantiationService.createInstance(ChatVoteDownButton, action, options as IMenuEntryActionViewItemOptions);
					}
					return createActionViewItem(scopedInstantiationService, action, options);
				}
			}));
		}

		const template: IReviewListItemTemplate = { value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, titleToolbar };
		return template;
	}

	renderElement(node: ITreeNode<ReviewTreeItem, FuzzyScore>, index: number, templateData: IReviewListItemTemplate): void {

		templateData.currentElement = node.element;
		if (templateData.titleToolbar) {
			templateData.titleToolbar.context = node.element;
		}

		dom.clearNode(templateData.value);
	}



	private updateItemHeight(templateData: IReviewListItemTemplate): void {
		if (!templateData.currentElement) {
			return;
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		templateData.currentElement.currentRenderedHeight = newHeight;
		this._onDidChangeItemHeight.fire({ element: templateData.currentElement, height: newHeight });
	}

	private renderCodeEdit(context: IPlanReviewContentPartRenderContext, edits: IChatCodeEdits, templateData: IReviewListItemTemplate) {
		const codeEditPart = this.instantiationService.createInstance(AideAgentCodeEditContentPart, undefined, edits, this._codeEditsPool);
		codeEditPart.addDisposable(codeEditPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return codeEditPart;
	}

	private renderMarkdown(markdown: IMarkdownString, templateData: IReviewListItemTemplate, context: IPlanReviewContentPartRenderContext, width = this._currentLayoutWidth) {
		const element = context.element;
		const fillInIncompleteTokens = !element.isComplete || element.isCanceled || !!element.renderData;
		// we are getting 0 as the codeBlockStartIndex over here which is wrong
		// cause that implies we will be overwriting all the codeblocks with the same value
		// which is the one at the very end
		// or the last entry which will generate a codeblock over here
		let codeBlockStartIndex = 0;
		for (const value of context.preceedingContentParts) {
			if (value instanceof ChatPlanStepPart) {
				codeBlockStartIndex = codeBlockStartIndex + value.getCodeBlocksPresent();
			} else {
				if (value instanceof ChatMarkdownContentPart) {
					codeBlockStartIndex = codeBlockStartIndex + value.codeblocks.length;
				}
			}
		}

		const markdownPart = this.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.renderer, width, this.codeBlockModelCollection, this.rendererOptions);
		const markdownPartId = markdownPart.id;
		markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => {
			markdownPart.layout(width);
			this.updateItemHeight(templateData);
		}));

		const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.exchangeId) ?? [];
		this.codeBlocksByResponseId.set(element.exchangeId, codeBlocksByResponseId);
		markdownPart.addDisposable(toDisposable(() => {
			const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.exchangeId);
			if (codeBlocksByResponseId) {
				// Only delete if this is my code block
				markdownPart.codeblocks.forEach((info, i) => {
					const codeblock = codeBlocksByResponseId[codeBlockStartIndex + i];
					if (codeblock?.ownerMarkdownPartId === markdownPartId) {
						delete codeBlocksByResponseId[codeBlockStartIndex + i];
					}
				});
			}
		}));

		markdownPart.codeblocks.forEach((info, i) => {
			codeBlocksByResponseId[codeBlockStartIndex + i] = info;
			if (info.uri) {
				const uri = info.uri;
				this.codeBlocksByEditorUri.set(uri, info);
				markdownPart.addDisposable(toDisposable(() => {
					const codeblock = this.codeBlocksByEditorUri.get(uri);
					if (codeblock?.ownerMarkdownPartId === markdownPartId) {
						this.codeBlocksByEditorUri.delete(uri);
					}
				}));
			}
		});

		return markdownPart;
	}

	disposeElement(node: ITreeNode<ReviewTreeItem, FuzzyScore>, index: number, templateData: IReviewListItemTemplate): void {

		// We could actually reuse a template across a renderElement call?
		if (templateData.renderedParts) {
			try {
				dispose(coalesce(templateData.renderedParts));
				templateData.renderedParts = undefined;
				dom.clearNode(templateData.value);
			} catch (err) {
				throw err;
			}
		}

		templateData.currentElement = undefined;
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IReviewListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

export class ChatListDelegate implements IListVirtualDelegate<ReviewTreeItem> {
	constructor(
		private readonly defaultElementHeight: number,
		@ILogService private readonly logService: ILogService
	) { }


	getHeight(element: ReviewTreeItem): number {
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? this.defaultElementHeight;
		return height;
	}

	getTemplateId(element: ReviewTreeItem): string {
		return ReviewListItemRenderer.ID;
	}

	hasDynamicHeight(element: ReviewTreeItem): boolean {
		return true;
	}
}
