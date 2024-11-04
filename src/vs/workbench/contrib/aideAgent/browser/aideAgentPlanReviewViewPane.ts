/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { extUri } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { PANEL_BACKGROUND, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ChatAgentLocation } from '../common/aideAgentAgents.js';
import { IAideAgentPlanService } from '../common/aideAgentPlanService.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { ChatViewModel, isRequestVM, isResponseVM } from '../common/aideAgentViewModel.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { IPlanReviewViewTitleActionContext } from './actions/aideAgentPlanReviewActions.js';
import { ChatTreeItem, IChatWidgetViewOptions, TreeUser } from './aideAgent.js';
import { ChatAccessibilityProvider } from './aideAgentAccessibilityProvider.js';
import { ChatListDelegate, ChatListItemRenderer, IReviewPlanRendererDelegate } from './aideAgentListRenderer.js';
import { ChatEditorOptions } from './aideAgentOptions.js';
import './media/aideAgentPlanReview.css';

const $ = dom.$;

export const PLAN_REVIEW_PANEL_ID = 'workbench.panel.aideAgentPlanReview';

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

const AideEditorStyleOptions = {
	listForeground: SIDE_BAR_FOREGROUND,
	listBackground: SIDE_BAR_BACKGROUND,
	overlayBackground: PANEL_SECTION_DRAG_AND_DROP_BACKGROUND,
	inputEditorBackground: PANEL_BACKGROUND,
	resultEditorBackground: editorBackground
};

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
	private _sessionId: string | null = null;
	public set sessionId(sessionId: string) {
		this._sessionId = sessionId;
	}
	private _exchangeId: string | null = null;
	public set exchangeId(exchangeId: string) {
		this._exchangeId = exchangeId;
	}

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
		@IAideAgentPlanService private readonly planService: IAideAgentPlanService,
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

		this._codeBlockModelCollection = this._register(instantiationService.createInstance(CodeBlockModelCollection));

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
		this.sessionId = sessionId;
		this.exchangeId = exchangeId;

		// The renderer is created once and not updated all the time
		// so this wont work
		let treeUser = TreeUser.ReviewPlan;
		if (this._sessionId && this._exchangeId && !this.planService.isPlanSession(this._sessionId, this._exchangeId)) {
			treeUser = TreeUser.Chat;
		}
		// update our renderer over here
		this.renderer.rendererUser = treeUser;
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
							(isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '') +
							// rerender if we have changed the user over here
							(this.renderer.rendererUser);
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
		const rendererDelegate: IReviewPlanRendererDelegate = {
			kind: 'planReview',
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			onDidScroll: this.onDidScroll,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		const supportsFileReferences: IChatWidgetViewOptions = { supportsFileReferences: true };
		this.renderer = this._register(scopedInstantiationService.createInstance(
			ChatListItemRenderer, // same renderer from chat
			'PlanReview',
			this._register(this.instantiationService.createInstance(ChatEditorOptions, 'planReview', AideEditorStyleOptions.listForeground, AideEditorStyleOptions.inputEditorBackground, AideEditorStyleOptions.resultEditorBackground)),
			// fuck it we ball
			ChatAgentLocation.Notebook,
			{ ...supportsFileReferences, renderCodeBlockPills: true },
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
				identityProvider: { getId: (e: ChatTreeItem) => e.id + this.renderer.rendererUser },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: ChatTreeItem) => e.username }, // TODO
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

		// If we are changing the renderer user we should also change the items
		// over here
		this._register(this.renderer.onDidChangeRendererUser(e => {
			this.onDidChangeItems();
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
