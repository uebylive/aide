/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, Disposable, IDisposable, dispose, toDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
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
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

// Common agent
import { ChatTreeItem, IChatWidgetViewOptions, IPlanReviewCodeBlockInfo, ReviewTreeItem } from './aideAgent.js';
import { ChatEditorOptions } from './aideAgentOptions.js';


// Taken from chat
import { ChatViewModel, isRequestVM, isResponseVM } from '../common/aideAgentViewModel.js';
import { ChatAccessibilityProvider } from './aideAgentAccessibilityProvider.js';
import { ChatMarkdownRenderer } from './aideAgentMarkdownRenderer.js';
import { ChatPlanStepPart } from './aideAgentContentParts/aideAgentPlanStepPart.js';
import { PlanReviewMarkdownContentPart, EditorPool } from './aideAgentContentParts/aideAgentPlanMarkdownContentPart.js';
import { DiffEditorPool } from './aideAgentContentParts/aideAgentTextEditContentPart.js';
import { IChatContentPart, IPlanReviewContentPartRenderContext } from './aideAgentContentParts/aideAgentContentParts.js';

// Proprietary for this feature
import { IPlanReviewViewTitleActionContext } from './actions/aideAgentPlanReviewActions.js';

import './media/aideAgentPlanReview.css';
import { Heroicon } from '../../../browser/heroicon.js';
import { ChatListItemRenderer, IChatRendererDelegate } from './aideAgentListRenderer.js';
import { AideEditorStyleOptions } from './aideAgentEditor.js';
import { ChatAgentLocation } from '../common/aideAgentAgents.js';
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { extUri } from '../../../../base/common/resources.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Schemas } from '../../../../base/common/network.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';

const $ = dom.$;

export const PLAN_REVIEW_PANEL_ID = 'workbench.panel.aideAgentPlanReview';

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

// TODO(codestory): Make sure to purge the state here
// when the session gets dispsed
// cleanup cycles are a bit weird but we should be able to handle them

export class PlanReviewPane extends ViewPane {
	private _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll = this._onDidScroll.event;

	private _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _onDidChangeContentHeight = new Emitter<void>();
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private listContainer!: HTMLElement;
	private tree!: WorkbenchObjectTree<ChatTreeItem>;
	private renderer!: ChatListItemRenderer;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;
	private visibleChangeCount = 0;

	private _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private previousTreeScrollHeight: number = 0;

	private _visible = false;
	public get visible() {
		return this._visible;
	}

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: ChatViewModel | undefined;
	private set viewModel(viewModel: ChatViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	constructor(
		options: IViewPaneOptions,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IAideAgentService private readonly chatService: IAideAgentService,
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

		// The chatService is the main thing which is handling all the things related to the session and the exchanges
		// The idea here is that the planReivewPane is yet another session albeit a special one
		// one where the id is: `${sessionId}-${exchangeId}`
		// for all events coming to the main chat service, we can also proxy it forward to this guy and let the rendering take care of things
		// The key differences here will be how we render the plan steps
		// each plan step will be a single exchange and be a rich element which we can render in a nice way the same way we
		// do things today
		// This allows us to handle things properly using a single service ChatService
		// while also supporting various truncated views and threads in some ways (neato)
		// without having to do extra work for handling lists etc because we have a way to render lists now
		// and we should just stick with it and render different elements properly
		// Incremental wins, lets start by just showing the titles over here properly and then we can move forward

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		// Don't know if this is needs to be per exchange id
		// this.memento = new Memento('aide-agent-plan-review', this.storageService);
		//this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
		this._codeBlockModelCollection = this._register(instantiationService.createInstance(CodeBlockModelCollection));

		// okay we have a cleanish way to figure out things over here

		// should probably dispose this as well but ....
		// const chatModel = this.chatService.startSession(ChatAgentLocation.Notebook, CancellationToken.None, false);
		// const session = this.chatService.getSession(chatModel?.sessionId);
		// if (chatModel === undefined) {
		// 	console.log('reviewPane::chatModel::notPresent');
		// 	return;
		// }
		// now lets see if we can suggest progress items over here just for show
		// we will figure out how to keep pushing things over here properly

		// undefined over here implies that we are not updating any of the values at all
		// so we are screwed, we want to pass a global object of sorts over here somehow
		// thinking of what that could be ..... (trying to brute-force our way right now
		// maximising reusing of the lists and the rich chat elements which we have)
		// const response = chatModel.addResponse();
		// chatModel.acceptResponseProgress(response, {
		// 	kind: 'markdownContent',
		// 	content: mockMarkdown,
		// }, false);
		// chatModel.completeResponse(response);
		// // This will inevitavely create a new session over here for the plan as well
		// // which kind of sucks but we can do better over here later on
		// console.log('reviewPane::chatModel::present', chatModel.sessionId);
		// this._viewModel = this.instantiationService.createInstance(ChatViewModel, chatModel, this._codeBlockModelCollection);
		// const currentElements = this._viewModel.getItems().length;
		this._register(codeEditorService.registerCodeEditorOpenHandler(async (input: ITextResourceEditorInput, _source: ICodeEditor | null, _sideBySide?: boolean): Promise<ICodeEditor | null> => {
			const resource = input.resource;
			if (resource.scheme !== Schemas.vscodeAideAgentCodeBlock) {
				return null;
			}

			const responseId = resource.path.split('/').at(1);
			if (!responseId) {
				return null;
			}

			const item = this.viewModel?.getItems().find(item => item.id === responseId);
			if (!item) {
				return null;
			}

			// TODO: needs to reveal the chat view

			this.reveal(item);

			await timeout(0); // wait for list to actually render

			for (const codeBlockPart of this.renderer.editorsInUse()) {
				if (extUri.isEqual(codeBlockPart.uri, resource, true)) {
					const editor = codeBlockPart.editor;

					let relativeTop = 0;
					const editorDomNode = editor.getDomNode();
					if (editorDomNode) {
						const row = dom.findParentWithClass(editorDomNode, 'monaco-list-row');
						if (row) {
							relativeTop = dom.getTopLeftOffset(editorDomNode).top - dom.getTopLeftOffset(row).top;
						}
					}

					if (input.options?.selection) {
						const editorSelectionTopOffset = editor.getTopForPosition(input.options.selection.startLineNumber, input.options.selection.startColumn);
						relativeTop += editorSelectionTopOffset;

						editor.focus();
						editor.setSelection({
							startLineNumber: input.options.selection.startLineNumber,
							startColumn: input.options.selection.startColumn,
							endLineNumber: input.options.selection.endLineNumber ?? input.options.selection.startLineNumber,
							endColumn: input.options.selection.endColumn ?? input.options.selection.startColumn
						});
					}

					this.reveal(item, relativeTop);

					return editor;
				}
			}
			return null;
		}));
	}

	reveal(item: ChatTreeItem, relativeTop?: number): void {
		this.tree.reveal(item, relativeTop);
	}

	override getActionsContext(): IPlanReviewViewTitleActionContext {
		return {
			planReviewView: this
		};
	}

	anchorPlanReviewPane(sessionId: string, exchangeId: string) {
		// fire a on did change over here
		this._onDidChangeContent.fire();
		const planId = `${sessionId}-${exchangeId}`;
		const planChatModel = this.chatService.getSession(planId);
		if (planChatModel === undefined) {
			return;
		}
		// update the view model to the one over here
		this._viewModel = this.instantiationService.createInstance(ChatViewModel, planChatModel, this._codeBlockModelCollection);
		this.setVisible(true);
		this.onDidChangeItems();
	}

	private onDidChangeItems(skipDynamicLayout?: boolean) {
		if (this.tree && this._visible) {
			const treeItems = (this.viewModel?.getItems() ?? [])
				.map((item): ITreeElement<ChatTreeItem> => {
					return {
						element: item,
						collapsed: false,
						collapsible: false
					};
				});

			// this._onWillMaybeChangeHeight.fire();

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return ((isResponseVM(element) || isRequestVM(element)) ? element.dataId : element.id) +
							// // TODO? We can give the welcome message a proper VM or get rid of the rest of the VMs
							// ((isWelcomeVM(element) && this.viewModel) ? `_${ChatModelInitState[this.viewModel.initState]}` : '') +
							// // Ensure re-rendering an element once slash commands are loaded, so the colorization can be applied.
							// `${(isRequestVM(element) || isWelcomeVM(element)) /* && !!this.lastSlashCommands ? '_scLoaded' : '' */}` +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this.visibleChangeCount}` : ''}` +
							// Re-render once content references are loaded
							(isResponseVM(element) ? `_${element.contentReferences.length}` : '') +
							// Rerender request if we got new content references in the response
							// since this may change how we render the corresponding attachments in the request
							(isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '');
					},
				}
			});

			if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
				this.layoutDynamicChatTreeItemMode();
			}
		}
	}

	private _dynamicMessageLayoutData?: { numOfMessages: number; maxHeight: number; enabled: boolean };

	// An alternative to layout, this allows you to specify the number of ChatTreeItems
	// you want to show, and the max height of the container. It will then layout the
	// tree to show that many items.
	// TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
	setDynamicChatTreeItemLayout(numOfChatTreeItems: number, maxHeight: number) {
		this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
		this._register(this.renderer.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));

		const mutableDisposable = this._register(new MutableDisposable());
		this._register(this.tree.onDidScroll((e) => {
			// TODO@TylerLeonhardt this should probably just be disposed when this is disabled
			// and then set up again when it is enabled again
			if (!this._dynamicMessageLayoutData?.enabled) {
				return;
			}
			mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
				if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
					return;
				}
				const renderHeight = e.height;
				const diff = e.scrollHeight - renderHeight - e.scrollTop;
				if (diff === 0) {
					return;
				}

				const possibleMaxHeight = (this._dynamicMessageLayoutData?.maxHeight ?? maxHeight);
				// const width = this.bodyDimension?.width ?? this.container.offsetWidth;
				// this.inputPart.layout(possibleMaxHeight, width);
				// const inputPartHeight = this.inputPart.inputPartHeight;
				// const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight);
				const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - 0);
				this.layout(newHeight + 0);
				// this.layout(newHeight + 0, width);
			});
		}));
	}

	layoutDynamicChatTreeItemMode(): void {
		if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
			return;
		}

		// const width = this.bodyDimension?.width ?? 0;
		// const width = this.bodyDimension?.width ?? this.container.offsetWidth;
		// this.inputPart.layout(this._dynamicMessageLayoutData.maxHeight, width);
		// const inputHeight = this.inputPart.inputPartHeight;
		const inputHeight = 0;

		const totalMessages = this.viewModel.getItems();
		// grab the last N messages
		const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);

		const needsRerender = messages.some(m => m.currentRenderedHeight === undefined);
		const listHeight = needsRerender
			? this._dynamicMessageLayoutData.maxHeight
			: messages.reduce((acc, message) => acc + message.currentRenderedHeight!, 0);

		this.layout(
			Math.min(
				// we add an additional 18px in order to show that there is scrollable content
				inputHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
				this._dynamicMessageLayoutData.maxHeight
			),
			// width
		);

		if (needsRerender || !listHeight) {
			// TODO: figure out a better place to reveal the last element
			revealLastElement(this.tree);
		}
	}

	// maybe we should do this only on:
	// onDidChangeBodyVisibility which is the event to listen to for view panes
	setListVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
		this.visibleChangeCount++;
		this.renderer.setVisible(visible);
		// this.input.setVisible(visible);

		if (visible) {
			this._register(disposableTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this._visible) {
					this.onDidChangeItems(true);
				}
			}, 0));
		} else if (wasVisible) {
			this._onDidHide.fire();
		}
	}


	protected override renderBody(parent: HTMLElement): void {
		try {
			console.log('renderBody::again');
			super.renderBody(parent);
			this.listContainer = dom.append(parent, $(`.aide-review-plan-list-container`));
			this.createList(this.listContainer);
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		width = Math.min(width, 850);

		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;

		const listHeight = height - 0;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.listContainer.style.height = `${height - 0}px`;

		this._onDidChangeHeight.fire(height);
	}

	private createList(listContainer: HTMLElement) {
		const scopedInstantiationService = this._register(this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]))));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate, 200);
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			onDidScroll: this.onDidScroll,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		const supportsFileReferences: IChatWidgetViewOptions = { supportsFileReferences: true };
		this.renderer = this._register(scopedInstantiationService.createInstance(
			ChatListItemRenderer,
			this._register(this.instantiationService.createInstance(ChatEditorOptions, 'planReview', AideEditorStyleOptions.listForeground, AideEditorStyleOptions.inputEditorBackground, AideEditorStyleOptions.resultEditorBackground)),
			// fuck it we ball
			ChatAgentLocation.Notebook,
			{ ...supportsFileReferences },
			rendererDelegate,
			this._codeBlockModelCollection,
			overflowWidgetsContainer,
		));

		this.tree = this._register(<WorkbenchObjectTree<ChatTreeItem>>scopedInstantiationService.createInstance(
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
				overrideStyles: {
					listFocusBackground: AideEditorStyleOptions.listBackground,
					listInactiveFocusBackground: AideEditorStyleOptions.listBackground,
					listActiveSelectionBackground: AideEditorStyleOptions.listBackground,
					listFocusAndSelectionBackground: AideEditorStyleOptions.listBackground,
					listInactiveSelectionBackground: AideEditorStyleOptions.listBackground,
					listHoverBackground: AideEditorStyleOptions.listBackground,
					listBackground: AideEditorStyleOptions.listBackground,
					listFocusForeground: AideEditorStyleOptions.listForeground,
					listHoverForeground: AideEditorStyleOptions.listForeground,
					listInactiveFocusForeground: AideEditorStyleOptions.listForeground,
					listInactiveSelectionForeground: AideEditorStyleOptions.listForeground,
					listActiveSelectionForeground: AideEditorStyleOptions.listForeground,
					listFocusAndSelectionForeground: AideEditorStyleOptions.listForeground,
					listActiveSelectionIconForeground: undefined,
					listInactiveSelectionIconForeground: undefined,
				}
			}));
		// this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		// console.log('list created');
		this._register(this.tree.onDidChangeContentHeight(() => {
			this.onDidChangeTreeContentHeight();
		}));

		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.tree.updateElementHeight(e.element, e.height);
		}));
		this._register(this.onDidChangeBodyVisibility((visibility) => {
			this.setListVisible(visibility);
		}));
		// register callback to fire when we get a ping from someone else
		this._register(this.onDidChange(() => {
			this.onDidChangeItems();
		}));
		this._register(this.onDidChangeContent(() => {
			this.onDidChangeItems();
		}));
		// this._register(this.tree.onDidFocus(() => {
		// 	this._onDidFocus.fire();
		// }));
		this._register(this.tree.onDidScroll(() => {
			this._onDidScroll.fire();
		}));

		// altho this is not correct, but for now we can assume that we are going
		// to show the tree items over here so we can do something cool here
		this.onDidChangeItems();
	}

	private onDidChangeTreeContentHeight(): void {
		if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
			// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
			// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
			const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight - 2;
			if (lastElementWasVisible) {
				dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
					// Can't set scrollTop during this event listener, the list might overwrite the change
					revealLastElement(this.tree);
				}, 0);
			}
		}

		this.previousTreeScrollHeight = this.tree.scrollHeight;
		this._onDidChangeContentHeight.fire();
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
		const rowContainer = dom.append(container, $('.aide-plan-review-item'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		const template: IReviewListItemTemplate = { rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService };
		return template;
	}

	renderElement(node: ITreeNode<ReviewTreeItem, FuzzyScore>, index: number, templateData: IReviewListItemTemplate): void {

		// console.log('renderElement');
		// dom.clearNode(templateData.rowContainer);
		//
		// Create a container for the title
		// const titleElement = dom.append(templateData.rowContainer, $('.review-item-title'));
		// titleElement.textContent = node.element.title;

		// If you want to render the description as well
		// if (node.element.description) {
		// 	const descriptionElement = dom.append(templateData.rowContainer, $('.review-item-description'));
		// 	const renderedMarkdown = this.renderer.render(node.element.description);
		// 	descriptionElement.appendChild(renderedMarkdown.element);
		// }

		// Store the current element in the template data
		// templateData.currentElement = node.element;

		// Update the item height after rendering
		//this.updateItemHeight(templateData);

		const element = node.element;

		const { title, description } = element;
		const rowContainer = templateData.rowContainer;

		const context: IPlanReviewContentPartRenderContext = {
			preceedingContentParts: [],
			element,
			index
		};

		dom.clearNode(rowContainer);

		const timelineElement = dom.append(rowContainer, $('.aide-review-plan-timeline'));
		const dotContainerElement = dom.append(timelineElement, $('.aide-plan-review-timeline-dot-container'));
		dom.append(dotContainerElement, $('.aide-plan-review-timeline-dot'));
		const saveIcon = this.instantiationService.createInstance(Heroicon, dotContainerElement, 'micro/check-circle');
		saveIcon.svg.classList.add('aide-plan-review-timeline-save-icon');
		templateData.elementDisposables.add(saveIcon);

		const dropIcon = this.instantiationService.createInstance(Heroicon, dotContainerElement, 'micro/x-circle');
		dropIcon.svg.classList.add('aide-plan-review-timeline-drop-icon');
		templateData.elementDisposables.add(dropIcon);

		const contentElement = dom.append(rowContainer, $('.aide-plan-review-content'));

		const header = dom.append(contentElement, $('.aide-plan-review-header'));
		const titleElement = dom.append(header, $('.aide-plan-review-title'));
		titleElement.textContent = title;

		const descriptionElement = dom.append(contentElement, $('.aide-plan-review-description'));
		const markdownPart = this.renderMarkdown(description, templateData, context);
		descriptionElement.appendChild(markdownPart.domNode);


		this.updateItemHeight(templateData);
		console.log(rowContainer.innerHTML);

	}



	private updateItemHeight(templateData: IReviewListItemTemplate): void {
		if (!templateData.currentElement) {
			return;
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		templateData.currentElement.currentRenderedHeight = newHeight;
		this._onDidChangeItemHeight.fire({ element: templateData.currentElement, height: newHeight });
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
