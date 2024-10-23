/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, Disposable, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
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
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getLocationBasedViewColors, IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ITreeElement, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

// Common agent
import { IPlanReviewCodeBlockInfo, ReviewTreeItem } from './aideAgent.js';
import { ChatEditorOptions } from './aideAgentOptions.js';


// Taken from chat
import { IChatCodeEdits } from '../common/aideAgentViewModel.js';
import { ChatAccessibilityProvider } from './aideAgentAccessibilityProvider.js';
import { ChatMarkdownRenderer } from './aideAgentMarkdownRenderer.js';
import { ChatPlanStepPart } from './aideAgentContentParts/aideAgentPlanStepPart.js';
import { PlanReviewMarkdownContentPart, EditorPool } from './aideAgentContentParts/aideAgentPlanMarkdownContentPart.js';
import { DiffEditorPool } from './aideAgentContentParts/aideAgentTextEditContentPart.js';
import { AideAgentCodeEditContentPart, CodeEditsPool } from './aideAgentContentParts/aideAgentCodeEditParts.js';
import { IChatContentPart, IPlanReviewContentPartRenderContext } from './aideAgentContentParts/aideAgentContentParts.js';

// Proprietary for this feature
import { IPlanReviewViewTitleActionContext } from './actions/aideAgentPlanReviewActions.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';


const $ = dom.$;



export const PLAN_REVIEW_PANEL_ID = 'workbench.panel.aideAgentPlanReview';

export class PlanReviewPane extends ViewPane {

	private listContainer!: HTMLElement;
	private tree!: WorkbenchObjectTree<ReviewTreeItem>;
	private renderer!: ReviewListItemRenderer;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;

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
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		// Don't know if this is needs to be per exchange id
		// this.memento = new Memento('aide-agent-plan-review', this.storageService);
		//this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;

		this._codeBlockModelCollection = this._register(instantiationService.createInstance(CodeBlockModelCollection));
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

			const treeItems: ITreeElement<ReviewTreeItem>[] = mockPlanSteps.map(item => ({ element: item, collapsed: false, collapsible: false }));

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => element.id,
				}
			});

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
		super.layoutBody(height, width);
	}

	private createList(listContainer: HTMLElement) {
		const scopedInstantiationService = this._register(this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]))));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate, 200);
		const rendererDelegate: IPlanReviewRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			//onDidScroll: this.onDidScroll,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		this.renderer = this._register(scopedInstantiationService.createInstance(
			ReviewListItemRenderer,
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
			'PlanReview',
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

export interface IPlanReviewRendererDelegate {
	getListLength(): number;
	readonly onDidScroll?: Event<void>;
}

interface IReviewListItemTemplate {
	currentElement?: ReviewTreeItem;
	renderedParts?: IChatContentPart[];
	readonly rowContainer: HTMLElement;
	// readonly titleToolbar?: MenuWorkbenchToolBar;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: ReviewTreeItem;
	height: number;
}

export class ReviewListItemRenderer extends Disposable implements ITreeRenderer<ReviewTreeItem, FuzzyScore, IReviewListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IPlanReviewCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IPlanReviewCodeBlockInfo>();

	private readonly renderer: MarkdownRenderer;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly editorOptions: ChatEditorOptions;
	private readonly _editorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _codeEditsPool: CodeEditsPool;
	//private readonly _treePool: TreePool;
	//private readonly _contentReferencesListPool: CollapsibleListPool;

	private _currentLayoutWidth: number = 0;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		delegate: IPlanReviewRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));


		const locationBasedColors = getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(PLAN_REVIEW_PANEL_ID));
		const styles = {
			listForeground: SIDE_BAR_FOREGROUND,
			listBackground: locationBasedColors.background,
			overlayBackground: locationBasedColors.overlayBackground,
			inputEditorBackground: locationBasedColors.background,
			resultEditorBackground: editorBackground
		};
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, PLAN_REVIEW_PANEL_ID, styles.listForeground, styles.inputEditorBackground, styles.resultEditorBackground));
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, this.editorOptions, delegate, overflowWidgetsDomNode));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, this.editorOptions, delegate, overflowWidgetsDomNode));
		// this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		//this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event));
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
		this._onDidChangeVisibility.fire(visible);
	}

	layout(width: number): void {
		this._currentLayoutWidth = width;
		for (const editor of this._editorPool.inUse()) {
			editor.layout(this._currentLayoutWidth);
		}
		for (const diffEditor of this._diffEditorPool.inUse()) {
			diffEditor.layout(this._currentLayoutWidth);
		}
	}

	renderTemplate(container: HTMLElement): IReviewListItemTemplate {
		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.aide-review-plan-item-container'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		const template: IReviewListItemTemplate = { rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService };
		return template;
	}

	renderElement(node: ITreeNode<ReviewTreeItem, FuzzyScore>, index: number, templateData: IReviewListItemTemplate): void {

		// templateData.currentElement = node.element;
		// if (templateData.titleToolbar) {
		// 	templateData.titleToolbar.context = node.element;
		// }

		console.log(node.element);

		dom.clearNode(templateData.rowContainer);
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
				if (value instanceof PlanReviewMarkdownContentPart) {
					codeBlockStartIndex = codeBlockStartIndex + value.codeblocks.length;
				}
			}
		}

		const markdownPart = this.instantiationService.createInstance(PlanReviewMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.renderer, width, this.codeBlockModelCollection, undefined);
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
				dom.clearNode(templateData.rowContainer);
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


const mockMarkdown = new MarkdownString(`To search among commit messages in Git, you can use the \`git log\` command with the \`--grep\` option. Here's a concise explanation of how to do it:

	\`\`\`
	git log --grep="search term"
	\`\`\`

	This command will search for commits whose messages contain the specified "search term". The search is case-sensitive by default.

	Some useful variations:

	1. Case-insensitive search:
		 \`\`\`
		 git log --grep="search term" --ignore-case
		 \`\`\`

	2. Search with regular expressions:
		 \`\`\`
		 git log --grep="search term" --extended-regexp
		 \`\`\`

	3. Limit the number of results:
		 \`\`\`
		 git log --grep="search term" -n 5
		 \`\`\`

	Would you like me to explain any of these options in more detail or provide examples of more advanced search patterns?`);


const mockPlanSteps: ReviewTreeItem[] = [{
	title: 'Modify the TextModel',
	description: mockMarkdown,
	id: '1',
	exchangeId: 'exchangeId',
	edits: [
		{ uri: URI.parse('file:///path/to/file1.txt'), range: Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 1 }) },
	],
	currentRenderedHeight: undefined,
	isComplete: true,
	isCanceled: false,
},
{
	title: 'Add a new language feature',
	description: mockMarkdown,
	id: '2',
	exchangeId: 'exchangeId',
	edits: [
		{ uri: URI.parse('file:///path/to/file1.txt'), range: Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 1 }) },
	],
	currentRenderedHeight: undefined,
	isComplete: true,
	isCanceled: false,
},
{
	title: 'Add the status bar item',
	description: mockMarkdown,
	id: '3',
	exchangeId: 'exchangeId',
	edits: [
		{ uri: URI.parse('file:///path/to/file1.txt'), range: Range.fromPositions({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 1 }) },
	],
	currentRenderedHeight: undefined,
	isComplete: true,
	isCanceled: false,
}];

