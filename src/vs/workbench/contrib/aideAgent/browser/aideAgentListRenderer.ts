/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../base/common/actions.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../nls.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem, createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { ChatAgentLocation } from '../common/aideAgentAgents.js';
import { CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING, CONTEXT_REQUEST, CONTEXT_RESPONSE, CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND, CONTEXT_RESPONSE_ERROR, CONTEXT_RESPONSE_FILTERED, CONTEXT_RESPONSE_VOTE } from '../common/aideAgentContextKeys.js';
import { IChatRequestVariableEntry, IChatTextEditGroup } from '../common/aideAgentModel.js';
import { chatSubcommandLeader } from '../common/aideAgentParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatCheckpointAdded, IChatConfirmation, IChatContentReference, IChatEditsInfo, IChatFollowup, IChatPlanInfo, IChatPlanStep, IChatRollbackCompleted, IChatTask, IChatTreeData } from '../common/aideAgentService.js';
import { IChatCodeCitations, IChatCodeEdits, IChatReferences, IChatRendererContent, IChatRequestViewModel, IChatResponseViewModel, IChatWelcomeMessageViewModel, isRequestVM, isResponseVM, isWelcomeVM } from '../common/aideAgentViewModel.js';
import { annotateSpecialMarkdownContent } from '../common/annotations.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { MarkUnhelpfulActionId } from './actions/aideAgentTitleActions.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatPlanStepsInfo, IEditPreviewCodeBlockInfo, ITreeUser, TreeUser } from './aideAgent.js';
import { ChatAttachmentsContentPart } from './aideAgentContentParts/aideAgentAttachmentsContentPart.js';
import { ChatCodeCitationContentPart } from './aideAgentContentParts/aideAgentCodeCitationContentPart.js';
import { AideAgentCodeEditContentPart, CodeEditsPool } from './aideAgentContentParts/aideAgentCodeEditParts.js';
import { ChatCommandButtonContentPart, ChatCommandGroupContentPart } from './aideAgentContentParts/aideAgentCommandContentPart.js';
import { ChatConfirmationContentPart } from './aideAgentContentParts/aideAgentConfirmationContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './aideAgentContentParts/aideAgentContentParts.js';
import { EditsContentPart } from './aideAgentContentParts/aideAgentEditsContentPart.js';
import { ChatMarkdownContentPart, EditPreviewEditorPool, EditorPool } from './aideAgentContentParts/aideAgentMarkdownContentPart.js';
import { ChatPlanStepPart } from './aideAgentContentParts/aideAgentPlanStepPart.js';
import { ChatProgressContentPart } from './aideAgentContentParts/aideAgentProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool } from './aideAgentContentParts/aideAgentReferencesContentPart.js';
import { ChatTaskContentPart } from './aideAgentContentParts/aideAgentTaskContentPart.js';
import { ChatTextEditContentPart, DiffEditorPool } from './aideAgentContentParts/aideAgentTextEditContentPart.js';
import { ChatTreeContentPart, TreePool } from './aideAgentContentParts/aideAgentTreeContentPart.js';
import { ChatWarningContentPart } from './aideAgentContentParts/aideAgentWarningContentPart.js';
import { ChatFollowups } from './aideAgentFollowups.js';
import { ChatMarkdownDecorationsRenderer } from './aideAgentMarkdownDecorationsRenderer.js';
import { ChatMarkdownRenderer } from './aideAgentMarkdownRenderer.js';
import { ChatEditorOptions } from './aideAgentOptions.js';
import { ChatCodeBlockContentProvider, CodeBlockPart } from './codeBlockPart.js';
import { PlanContentPart } from './aideAgentContentParts/aideAgentPlanContentPart.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { CollapsedExchangesContentPart } from './aideAgentContentParts/aideAgentCollapsedExchangesPart.js';
import { CheckpointFlag } from './aideAgentContentParts/aideAgentCheckpointFlag.js';


const $ = dom.$;

interface IBaseListItemTemplate {
	currentElement?: ChatTreeItem;
	renderedParts?: IChatContentPart[];
	readonly rowContainer: HTMLElement;
	readonly value: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly instantiationService: IInstantiationService;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
}

interface IChatListItemTemplate extends IBaseListItemTemplate {
	kind: 'chatTemplate';
	actionViewItem?: PlanStepViewActionItem;
	readonly username: HTMLElement;
	readonly detail: HTMLElement;
	readonly titleToolbar?: MenuWorkbenchToolBar;
}

interface IPlanReviewListItemTemplate extends IBaseListItemTemplate {
	kind: 'planReviewTemplate';
	// readonly saveIcon: Heroicon;
	// readonly dropIcon: Heroicon;
	readonly titleToolbar: MenuWorkbenchToolBar;
}

type IAgentListItemTemplate = IChatListItemTemplate | IPlanReviewListItemTemplate;

interface IItemHeightChangeParams {
	element: ChatTreeItem;
	height: number;
}

const forceVerboseLayoutTracing = false
	// || Boolean("TRUE") // causes a linter warning so that it cannot be pushed
	;


export interface IBaseRenderDelegate {
	getListLength(): number;
	readonly onDidScroll?: Event<void>;
}


export interface IChatRendererDelegate extends IBaseRenderDelegate {
	kind: 'chat';
	setWillBeDroppedStep(index: number | undefined): void;
	setWillBeSavedStep(index: number | undefined): void;
	setSavedStep(index: number | undefined): void;
}

export interface IReviewPlanRendererDelegate extends IBaseRenderDelegate {
	kind: 'planReview';
	// Should contain above methods
}

export class ChatListItemRenderer extends Disposable implements ITreeRenderer<ChatTreeItem, FuzzyScore, IAgentListItemTemplate> {
	static readonly ID = 'item';

	private readonly codeBlocksByResponseId = new Map<string, IChatCodeBlockInfo[]>();
	private readonly codeBlocksByEditorUri = new ResourceMap<IChatCodeBlockInfo>();
	private readonly editPreviewBlocksByResponseId = new Map<string, IEditPreviewCodeBlockInfo[]>();

	private readonly fileTreesByResponseId = new Map<string, IChatFileTreeInfo[]>();
	private readonly focusedFileTreesByResponseId = new Map<string, number>();

	private readonly planStepsByResponseId = new Map<string, IChatPlanStepsInfo[]>();
	private readonly focusedPlanStepsByResponseId = new Map<string, number>();

	private readonly renderer: MarkdownRenderer;
	private readonly markdownDecorationsRenderer: ChatMarkdownDecorationsRenderer;

	protected readonly _onDidClickFollowup = this._register(new Emitter<IChatFollowup>());
	readonly onDidClickFollowup: Event<IChatFollowup> = this._onDidClickFollowup.event;

	private readonly _onDidClickRerunWithAgentOrCommandDetection = new Emitter<IChatResponseViewModel>();
	readonly onDidClickRerunWithAgentOrCommandDetection: Event<IChatResponseViewModel> = this._onDidClickRerunWithAgentOrCommandDetection.event;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	private readonly _editorPool: EditorPool;
	private readonly _diffEditorPool: DiffEditorPool;
	private readonly _editPreviewEditorPool: EditPreviewEditorPool;
	private readonly _treePool: TreePool;
	private readonly _contentReferencesListPool: CollapsibleListPool;
	private readonly _codeEditsPool: CodeEditsPool;
	protected readonly _onDidChangeRendererUser = this._register(new Emitter<ITreeUser>());
	readonly onDidChangeRendererUser: Event<ITreeUser> = this._onDidChangeRendererUser.event;
	private _uniqueId: string | null = null;
	get uniqueId(): string {
		return this._uniqueId ?? 'not Set';
	}

	private _rendererUser: ITreeUser = 'Chat';
	set rendererUser(treeUser: ITreeUser) {
		if (this._rendererUser !== treeUser) {
			this._rendererUser = treeUser;
			this._onDidChangeRendererUser.fire(treeUser);
		}
	}

	private _currentLayoutWidth: number = 0;
	private _isVisible = true;
	private _onDidChangeVisibility = this._register(new Emitter<boolean>());

	constructor(
		uniqueId: string,
		editorOptions: ChatEditorOptions,
		private readonly location: ChatAgentLocation,
		private readonly rendererOptions: IChatListItemRendererOptions,
		private readonly delegate: IChatRendererDelegate | IReviewPlanRendererDelegate,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._uniqueId = uniqueId;

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
		this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
		this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._editPreviewEditorPool = this._register(this.instantiationService.createInstance(EditPreviewEditorPool, editorOptions, delegate, overflowWidgetsDomNode));
		this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
		this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event));
		this._codeEditsPool = this._register(this.instantiationService.createInstance(CodeEditsPool, this._onDidChangeVisibility.event));

		this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
	}

	get templateId(): string {
		return ChatListItemRenderer.ID;
	}

	editorsInUse(): Iterable<CodeBlockPart> {
		return this._editorPool.inUse();
	}

	private traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
		}
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		const codeBlocks = this.codeBlocksByResponseId.get(response.id);
		return codeBlocks ?? [];
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.codeBlocksByEditorUri.get(uri);
	}

	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		const fileTrees = this.fileTreesByResponseId.get(response.id);
		return fileTrees ?? [];
	}

	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		const fileTrees = this.fileTreesByResponseId.get(response.id);
		const lastFocusedFileTreeIndex = this.focusedFileTreesByResponseId.get(response.id);
		if (fileTrees?.length && lastFocusedFileTreeIndex !== undefined && lastFocusedFileTreeIndex < fileTrees.length) {
			return fileTrees[lastFocusedFileTreeIndex];
		}
		return undefined;
	}

	getPlanStepsInfoForResponse(response: IChatResponseViewModel): IChatPlanStepsInfo[] {
		const planSteps = this.planStepsByResponseId.get(response.id);
		return planSteps ?? [];
	}

	getLastFocusePlanStepForResponse(response: IChatResponseViewModel): IChatPlanStepsInfo | undefined {
		const planSteps = this.planStepsByResponseId.get(response.id);
		const lastFocusedFileTreeIndex = this.focusedPlanStepsByResponseId.get(response.id);
		if (planSteps?.length && lastFocusedFileTreeIndex !== undefined && lastFocusedFileTreeIndex < planSteps.length) {
			return planSteps[lastFocusedFileTreeIndex];
		}
		return undefined;
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
		for (const editPreviewEditor of this._editPreviewEditorPool.inUse()) {
			editPreviewEditor.layout(this._currentLayoutWidth);
		}
	}

	renderTemplate(container: HTMLElement): IAgentListItemTemplate {
		if (this._rendererUser === TreeUser.Chat) {
			return this.renderChatTemplate(container);
		}
		if (this._rendererUser === TreeUser.ReviewPlan) {
			return this.renderReviewItemTemplate(container);
		}
		throw new Error('Unknown list user');
	}

	private renderChatTemplate(container: HTMLElement): IChatListItemTemplate {
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
		// dom.append(detailContainer, $('span.chat-animated-ellipsis'));

		// TODO(@g-danna) there is some repetition from here, onwards, will fix this

		const value = dom.append(valueParent, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		let titleToolbar: MenuWorkbenchToolBar | undefined;
		let actionViewItem: PlanStepViewActionItem | undefined;

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
					if (action instanceof MenuItemAction) {

						// if (action.item.id === MarkUnhelpfulActionId) {
						// 	return scopedInstantiationService.createInstance(ChatVoteDownButton, action, options as IMenuEntryActionViewItemOptions);
						// }
						if (this.delegate.kind === 'chat') {
							actionViewItem = templateDisposables.add(this.instantiationService.createInstance(PlanStepViewActionItem, action, options as IMenuEntryActionViewItemOptions));
							return actionViewItem;
						}
					}
					return undefined;
				}
			}));
		}

		const template: IChatListItemTemplate = { kind: 'chatTemplate', actionViewItem, username, detail, value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, titleToolbar };
		return template;
	}

	private renderReviewItemTemplate(container: HTMLElement): IPlanReviewListItemTemplate {

		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.aideagent-item-container.aideagent-review-plan'));
		const timelineElement = rowContainer.appendChild($('.aideagent-timeline'));
		const dotContainer = timelineElement.appendChild($('.aideagent-timeline-dot-container'));
		dotContainer.appendChild($('.aideagent-timeline-dot'));

		// const saveIcon = templateDisposables.add(this.instantiationService.createInstance(Heroicon, dotContainer, 'micro/check-circle', { 'class': 'aideagent-timeline-save-icon' }));
		// const dropIcon = templateDisposables.add(this.instantiationService.createInstance(Heroicon, dotContainer, 'micro/x-circle', { 'class': 'aideagent-timeline-drop-icon' }));

		const timelineContainer = timelineElement.appendChild($('.aideagent-timeline-line-container'));
		timelineContainer.appendChild($('.aideagent-timeline-line'));

		const header = dom.append(rowContainer, $('.header'));
		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));

		const titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, header, MenuId.AideAgentReviewPlanSteps, {
			menuOptions: {
				shouldForwardArgs: true
			},
			toolbarOptions: {
				shouldInlineSubmenu: submenu => submenu.actions.length <= 1
			},
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action instanceof MenuItemAction && action.item.id === MarkUnhelpfulActionId) {
					return scopedInstantiationService.createInstance(ChatVoteDownButton, action, options as IMenuEntryActionViewItemOptions);
				} else {
					return createActionViewItem(scopedInstantiationService, action, options);
				}
			}
		}));

		const template: IPlanReviewListItemTemplate = {
			kind: 'planReviewTemplate', // saveIcon, dropIcon,
			value, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, titleToolbar
		};
		return template;

	}

	renderElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IAgentListItemTemplate): void {
		const expectedKind = this._rendererUser === TreeUser.Chat ? 'chatTemplate' : 'planReviewTemplate';
		if (templateData.kind !== expectedKind) {
			// Dispose of the old template data
			this.disposeTemplate(templateData);
			// Create a new template
			const container = templateData.rowContainer.parentElement!;
			dom.clearNode(container);
			const newTemplateData = this.renderTemplate(container);
			// Update the templateData reference
			Object.assign(templateData, newTemplateData);
		}
		this.renderChatTreeItem(node.element, index, templateData);
	}

	renderChatTreeItem(element: ChatTreeItem, index: number, templateData: IAgentListItemTemplate): void {
		templateData.currentElement = element;

		const kind = isRequestVM(element) ? 'request' :
			isResponseVM(element) ? 'response' :
				'welcome';
		this.traceLayout('renderElement', `${kind}, index=${index}`);

		CONTEXT_RESPONSE.bindTo(templateData.contextKeyService).set(isResponseVM(element));
		CONTEXT_REQUEST.bindTo(templateData.contextKeyService).set(isRequestVM(element));
		CONTEXT_RESPONSE_DETECTED_AGENT_COMMAND.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
		if (isResponseVM(element)) {
			CONTEXT_CHAT_RESPONSE_SUPPORT_ISSUE_REPORTING.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? 'up' : element.vote === ChatAgentVoteDirection.Down ? 'down' : '');
		} else {
			CONTEXT_RESPONSE_VOTE.bindTo(templateData.contextKeyService).set('');
		}

		if (templateData.titleToolbar) {
			if (templateData.kind === 'chatTemplate') {
				if (isResponseVM(element)) {
					templateData.titleToolbar.context = { sessionId: element.sessionId, index };
				}
			}
			if (templateData.kind === 'planReviewTemplate') {
				let planSessionId = null;
				let planExchangeId = null;
				if (isResponseVM(element)) {
					planSessionId = element.planSessionId;
					planExchangeId = element.planExchangeId;
				}
				templateData.titleToolbar.context = {
					stepIndex: index,
					sessionId: planSessionId,
					exchangeId: planExchangeId,
				};
			}
		}

		if (templateData.kind === 'planReviewTemplate' && isResponseVM(element)) {

			templateData.rowContainer.classList.toggle('will-be-dropped', element.willBeDropped);
			templateData.rowContainer.classList.toggle('will-be-saved', element.willBeSaved);
			templateData.rowContainer.classList.toggle('is-saved', element.isSaved);

			if (index < this.delegate.getListLength() - 1) {
				if (!templateData.rowContainer.classList.contains('aideagent-timeline-line-forerunner')) {
					templateData.rowContainer.classList.add('aideagent-timeline-line-forerunner');
				}
			} else {
				templateData.rowContainer.classList.remove('aideagent-timeline-line-forerunner');
			}
		}

		CONTEXT_RESPONSE_ERROR.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
		CONTEXT_RESPONSE_FILTERED.bindTo(templateData.contextKeyService).set(isFiltered);

		templateData.rowContainer.classList.toggle('interactive-request', isRequestVM(element));
		templateData.rowContainer.classList.toggle('interactive-response', isResponseVM(element));
		templateData.rowContainer.classList.toggle('interactive-welcome', isWelcomeVM(element));
		templateData.rowContainer.classList.toggle('show-detail-progress', isResponseVM(element) && !element.isComplete && !element.progressMessages.length);

		if (templateData.kind === 'chatTemplate') {
			templateData.username.textContent = (isResponseVM(element) && !element.model.isUserResponse || isWelcomeVM(element)) ? element.username : localize('chatUser', "You");
			if (isResponseVM(element) && !element.model.isUserResponse || isWelcomeVM(element)) {
				templateData.username.classList.add('agent');
			} else {
				templateData.username.classList.remove('agent');
			}

			dom.clearNode(templateData.detail);
		}

		if (isResponseVM(element) && templateData.kind === 'chatTemplate') {
			this.renderDetail(element, templateData);

			if (templateData.actionViewItem) {
				// TODO (g-danna) This won't work, probably should append event listeners to the DOM element here
				// instead of setting a callback
				templateData.actionViewItem.onPreview = () => {
					if (this.delegate.kind === 'chat') {
						this.delegate.setWillBeSavedStep(index);
					}
				};
				templateData.actionViewItem.onDismiss = () => {
					if (this.delegate.kind === 'chat') {
						this.delegate.setWillBeSavedStep(undefined);
					}
				};
			}
		}

		if (isRequestVM(element) && templateData.kind === 'chatTemplate' && element.confirmation) {
			this.renderConfirmationAction(element, templateData);
		}

		// Do a progressive render if
		// - This the last response in the list
		// - And it has some content
		// - And the response is not complete
		//   - Or, we previously started a progressive rendering of this element (if the element is complete, we will finish progressive rendering with a very fast rate)
		if (isResponseVM(element) && index === this.delegate.getListLength() - 1 && (!element.isComplete || element.renderData) && element.response.value.length) {

			this.traceLayout('renderElement', `start progressive render ${kind}, index=${index}`);

			const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
			const runProgressiveRender = (initial?: boolean) => {
				try {
					if (this.doNextProgressiveRender(element, index, templateData, !!initial)) {
						timer.cancel();
					}
				} catch (err) {
					// Kill the timer if anything went wrong, avoid getting stuck in a nasty rendering loop.
					timer.cancel();
					this.logService.error(err);
				}
			};
			timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
			runProgressiveRender(true);
		} else if (isResponseVM(element)) {
			this.basicRenderElement(element, index, templateData);
		} else if (isRequestVM(element)) {
			this.basicRenderElement(element, index, templateData);
		} else {
			this.renderWelcomeMessage(element, templateData);
		}
	}

	private renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {
		templateData.elementDisposables.add(autorun(reader => {
			this._renderDetail(element, templateData);
		}));
	}

	private _renderDetail(element: IChatResponseViewModel, templateData: IChatListItemTemplate): void {

		dom.clearNode(templateData.detail);

		if (element.agentOrSlashCommandDetected) {
			const msg = element.slashCommand ? localize('usedAgentSlashCommand', "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize('usedAgent', "[[(rerun without)]]");
			dom.reset(templateData.detail, renderFormattedText(msg, {
				className: 'agentOrSlashCommandDetected',
				inline: true,
				actionHandler: {
					disposables: templateData.elementDisposables,
					callback: (content) => {
						this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
					},
				}
			}));
		}
		// else if (!element.isComplete) {
		// 	templateData.detail.textContent = GeneratingPhrase;
		// }
	}

	private renderConfirmationAction(element: IChatRequestViewModel, templateData: IChatListItemTemplate) {
		dom.clearNode(templateData.detail);
		if (element.confirmation) {
			templateData.detail.textContent = localize('chatConfirmationAction', 'selected "{0}"', element.confirmation);
		}
	}


	private basicRenderElement(element: ChatTreeItem, index: number, templateData: IAgentListItemTemplate) {
		let value: IChatRendererContent[] = [];
		if (isRequestVM(element) && !element.confirmation) {
			const markdown = 'message' in element.message ?
				element.message.message :
				this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.message);
			value = [{ content: new MarkdownString(markdown), kind: 'markdownContent' }];
		} else if (isResponseVM(element)) {
			if (element.codeCitations.length) {
				value.push({ kind: 'codeCitations', citations: element.codeCitations });
			}
			if (element.editsInfo) {
				if (!element.model.isUserResponse) {
					const basePlanInfoMessage = 'OK, I am working on it';
					if (element.editsInfo.description) {
						const planInfoMessage = `${basePlanInfoMessage} - ${element.editsInfo.description.value}`;
						value.push({ content: new MarkdownString(planInfoMessage), kind: 'markdownContent' });
					} else {
						value.push({ content: new MarkdownString(basePlanInfoMessage), kind: 'markdownContent' });
					}
				} else {
					value.push({ ...element.editsInfo });
				}
			}
			if (element.planInfo) {
				if (!element.model.isUserResponse) {
					// Duplicated content above to remove
					if (element.planInfo.description) {
						const planInfoMessage = `Working on: ${element.planInfo.description.value}`;
						value.push({ content: new MarkdownString(planInfoMessage), kind: 'markdownContent' });
					} else {
						if (element.planInfo.state === 'Complete') {
							const completeMessage = 'Finished editing';
							value.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
						} else if (element.planInfo.state === 'Cancelled') {
							const completeMessage = 'Cancelled by the user';
							value.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
						} else if (element.planInfo.state === 'Accepted') {
							const completeMessage = 'Accepted by user';
							value.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });

						} else if (element.planInfo.state === 'Started') {
							const completeMessage = 'Thinking';
							value.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
						}
					}
				} else {
					// Display it as a rich element
					value.push({ ...element.planInfo });
				}
			}
			value.push(...annotateSpecialMarkdownContent(element.response.value));
			if (element.codeEdits?.size) {
				value.push({ kind: 'codeEdits', edits: element.codeEdits });
			}
			if (element.contentReferences.length) {
				value.push({ kind: 'references', references: element.contentReferences });
			}
		}

		dom.clearNode(templateData.value);

		if (isResponseVM(element) && templateData.kind === 'chatTemplate') {
			this.renderDetail(element, templateData);
		}

		const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);

		const parts: IChatContentPart[] = [];
		if (!isFiltered) {
			value.forEach((data, index) => {
				const context: IChatContentPartRenderContext = {
					user: this._rendererUser,
					element,
					index,
					content: value,
					preceedingContentParts: parts,
				};
				const newPart = this.renderChatContentPart(data, templateData, context, index);
				if (newPart) {
					templateData.value.appendChild(newPart.domNode);
					parts.push(newPart);
				}
			});
		}

		if (templateData.renderedParts) {
			dispose(templateData.renderedParts);
		}
		templateData.renderedParts = parts;

		if (!isFiltered) {
			if (isRequestVM(element) && element.variables.length) {
				const newPart = this.renderAttachments(element.variables, element.contentReferences, templateData);
				if (newPart) {
					templateData.value.appendChild(newPart.domNode);
					templateData.elementDisposables.add(newPart);
				}
			}
		}

		if (isResponseVM(element) && element.errorDetails?.message) {
			const renderedError = this.instantiationService.createInstance(ChatWarningContentPart, element.errorDetails.responseIsFiltered ? 'info' : 'error', new MarkdownString(element.errorDetails.message), this.renderer);
			templateData.elementDisposables.add(renderedError);
			templateData.value.appendChild(renderedError.domNode);
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.rowContainer.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: element.currentRenderedHeight });
			}));
		}
	}

	private updateItemHeight(templateData: IAgentListItemTemplate): void {
		if (!templateData.currentElement) {
			return;
		}

		const newHeight = templateData.rowContainer.offsetHeight;
		templateData.currentElement.currentRenderedHeight = newHeight;
		this._onDidChangeItemHeight.fire({ element: templateData.currentElement, height: newHeight });
	}

	private renderWelcomeMessage(element: IChatWelcomeMessageViewModel, templateData: IAgentListItemTemplate) {
		dom.clearNode(templateData.value);

		element.content.forEach((item, i) => {
			if (Array.isArray(item)) {
				const scopedInstaService = templateData.elementDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, templateData.contextKeyService])));
				templateData.elementDisposables.add(
					scopedInstaService.createInstance<typeof ChatFollowups<IChatFollowup>, ChatFollowups<IChatFollowup>>(
						ChatFollowups,
						templateData.value,
						item,
						this.location,
						undefined,
						followup => this._onDidClickFollowup.fire(followup)));
			} else {
				const context: IChatContentPartRenderContext = {
					user: this._rendererUser,
					element,
					index: i,
					// NA for welcome msg
					content: [],
					preceedingContentParts: []
				};
				const result = this.renderMarkdown(item, templateData, context);
				templateData.value.appendChild(result.domNode);
				templateData.elementDisposables.add(result);
			}
		});

		const newHeight = templateData.rowContainer.offsetHeight;
		const fireEvent = !element.currentRenderedHeight || element.currentRenderedHeight !== newHeight;
		element.currentRenderedHeight = newHeight;
		if (fireEvent) {
			const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
				// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
				// If it becomes properly sync, then this could be removed.
				element.currentRenderedHeight = templateData.rowContainer.offsetHeight;
				disposable.dispose();
				this._onDidChangeItemHeight.fire({ element, height: element.currentRenderedHeight });
			}));
		}
	}

	/**
	 *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
	 */
	private doNextProgressiveRender(element: IChatResponseViewModel, index: number, templateData: IAgentListItemTemplate, isInRenderElement: boolean): boolean {
		if (!this._isVisible) {
			return true;
		}

		if (element.isCanceled) {
			this.traceLayout('doNextProgressiveRender', `canceled, index=${index}`);
			element.renderData = undefined;
			this.basicRenderElement(element, index, templateData);
			return true;
		}

		this.traceLayout('doNextProgressiveRender', `START progressive render, index=${index}, renderData=${JSON.stringify(element.renderData)}`);
		const contentForThisTurn = this.getNextProgressiveRenderContent(element);
		const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn, element);

		// Render all parts
		this.renderChatContentDiff(partsToRender, contentForThisTurn, element, templateData);

		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		if (!isInRenderElement) {
			this._onDidChangeItemHeight.fire({ element, height: templateData.rowContainer.offsetHeight });
		}

		// Always return true to indicate rendering is complete
		return true;
	}

	private renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, templateData: IAgentListItemTemplate): void {
		const renderedParts = templateData.renderedParts ?? [];
		templateData.renderedParts = renderedParts;
		partsToRender.forEach((partToRender, index) => {
			if (!partToRender) {
				// null=no change
				return;
			}

			const alreadyRenderedPart = templateData.renderedParts?.[index];
			if (alreadyRenderedPart) {
				alreadyRenderedPart.dispose();
			}

			const preceedingContentParts = renderedParts.slice(0, index);
			const context: IChatContentPartRenderContext = {
				user: this._rendererUser,
				element,
				content: contentForThisTurn,
				preceedingContentParts,
				index
			};
			// TODO(codestory): The session id is not passed properly, so this
			// is a big hack and I am lazy, sue me
			if (partToRender.kind === 'planStep') {
				partToRender.sessionId = element.sessionId;
			}
			const newPart = this.renderChatContentPart(partToRender, templateData, context, index);
			if (newPart) {
				// Maybe the part can't be rendered in this context, but this shouldn't really happen
				if (alreadyRenderedPart) {
					try {
						// This method can throw HierarchyRequestError
						alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
					} catch (err) {
						this.logService.error('ChatListItemRenderer#renderChatContentDiff: error replacing part', err);
					}
				} else {
					templateData.value.appendChild(newPart.domNode);
				}

				renderedParts[index] = newPart;
			} else if (alreadyRenderedPart) {
				alreadyRenderedPart.domNode.remove();
			}
		});
	}

	/**
	 * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
	 */
	private getNextProgressiveRenderContent(element: IChatResponseViewModel): IChatRendererContent[] {
		const renderableResponse = annotateSpecialMarkdownContent(element.response.value);

		const partsToRender: IChatRendererContent[] = [];
		if (element.editsInfo) {
			partsToRender.push(element.editsInfo);
		}

		if (element.planInfo) {
			if (!element.model.isUserResponse) {
				// Duplicated content above to remove
				if (element.planInfo.description) {
					const planInfoMessage = `Working on: ${element.planInfo.description.value}`;
					partsToRender.push({ content: new MarkdownString(planInfoMessage), kind: 'markdownContent' });
				} else {
					if (element.planInfo.state === 'Complete') {
						const completeMessage = 'Finished editing';
						partsToRender.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
					} else if (element.planInfo.state === 'Cancelled') {
						const completeMessage = 'Cancelled by the user';
						partsToRender.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
					} else if (element.planInfo.state === 'Accepted') {
						const completeMessage = 'Accepted by user';
						partsToRender.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });

					} else if (element.planInfo.state === 'Started') {
						const completeMessage = 'Thinking';
						partsToRender.push({ content: new MarkdownString(completeMessage), kind: 'markdownContent' });
					}
				}
			} else {
				// Display it as a rich element
				partsToRender.push({ ...element.planInfo });
			}
		}

		// Simply add all parts to render
		partsToRender.push(...renderableResponse);

		// Render code edits at the end
		if (element.codeEdits?.size) {
			partsToRender.push({ kind: 'codeEdits', edits: element.codeEdits });
		}

		if (element.contentReferences.length) {
			partsToRender.push({ kind: 'references', references: element.contentReferences });
		}

		// Update the render data
		const newRenderedWordCount = renderableResponse.reduce((count, part) => {
			if (part.kind === 'markdownContent') {
				return count + part.content.value.split(/\s+/).length;
			}
			return count;
		}, 0);

		element.renderData = {
			lastRenderTime: Date.now(),
			renderedWordCount: newRenderedWordCount,
			renderedParts: partsToRender
		};

		return partsToRender;
	}

	private diff(renderedParts: ReadonlyArray<IChatContentPart>, contentToRender: ReadonlyArray<IChatRendererContent>, element: ChatTreeItem): ReadonlyArray<IChatRendererContent | null> {
		const diff: (IChatRendererContent | null)[] = [];
		for (let i = 0; i < contentToRender.length; i++) {
			const content = contentToRender[i];
			const renderedPart = renderedParts[i];

			if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
				diff.push(content);
			} else {
				// null -> no change
				diff.push(null);
			}
		}
		return diff;
	}

	private renderChatContentPart(content: IChatRendererContent, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext, index: number): IChatContentPart | undefined {
		if (content.kind === 'treeData') {
			return this.renderTreeData(content, templateData, context);
		} else if (content.kind === 'rollbackCompleted') {
			return this.renderRollbackCompleted(content);
		} else if (content.kind === 'checkpointAdded') {
			return this.renderCheckpoint(content);
		} else if (content.kind === 'progressMessage') {
			return this.instantiationService.createInstance(ChatProgressContentPart, content, this.renderer, context);
		} else if (content.kind === 'progressTask') {
			return this.renderProgressTask(content, templateData, context);
		} else if (content.kind === 'command') {
			return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
		} else if (content.kind === 'commandGroup') {
			return this.instantiationService.createInstance(ChatCommandGroupContentPart, content.commands, context);
		} else if (content.kind === 'textEditGroup') {
			return this.renderTextEdit(context, content, templateData);
		} else if (content.kind === 'codeEdits') {
			return this.renderCodeEdit(context, content, templateData);
		} else if (content.kind === 'confirmation') {
			return this.renderConfirmation(context, content, templateData);
		} else if (content.kind === 'warning') {
			return this.instantiationService.createInstance(ChatWarningContentPart, 'warning', content.content, this.renderer);
		} else if (content.kind === 'markdownContent') {
			const markdownPart = this.renderMarkdown(content.content, templateData, context);
			if (templateData.kind === 'planReviewTemplate' && isResponseVM(templateData.currentElement) && index === 0) {
				// We use markdown to progressively render the plan step heading in plan review
				// this attr is used in CSS to prepend the plan step
				const stepNumber = templateData.currentElement.responseIndex + 1;
				markdownPart.domNode.setAttribute('data-index', stepNumber.toString());
			}
			return markdownPart;
		} else if (content.kind === 'references') {
			return this.renderContentReferencesListData(content, undefined, context, templateData);
		} else if (content.kind === 'codeCitations') {
			return this.renderCodeCitationsListData(content, context, templateData);
		} else if (content.kind === 'editsInfo') {
			return this.renderEdits(content, templateData, context, content.sessionId, content.exchangeId);
		} else if (content.kind === 'planInfo') {
			return this.renderPlanInfo(content, templateData, context, content.sessionId, content.exchangeId);
		} else if (content.kind === 'planStep') {
			// @g-danna This will be deprecated soon
			return this.renderPlanStep(content, templateData, context);
		} else if (content.kind === 'thinkingForEdit') {
			// thinking for edit uses the markdown rendering
			return this.renderMarkdown(content.thinkingDelta, templateData, context);
		}

		return undefined;
	}

	private renderTreeData(content: IChatTreeData, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {
		const data = content.treeData;
		const treeDataIndex = context.preceedingContentParts.filter(part => part instanceof ChatTreeContentPart).length;
		const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, context.element, this._treePool, treeDataIndex);

		treePart.addDisposable(treePart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		if (isResponseVM(context.element)) {
			const fileTreeFocusInfo = {
				treeDataId: data.uri.toString(),
				treeIndex: treeDataIndex,
				focus() {
					treePart.domFocus();
				}
			};

			// TODO@roblourens there's got to be a better way to navigate trees
			treePart.addDisposable(treePart.onDidFocus(() => {
				this.focusedFileTreesByResponseId.set(context.element.id, fileTreeFocusInfo.treeIndex);
			}));

			const fileTrees = this.fileTreesByResponseId.get(context.element.id) ?? [];
			fileTrees.push(fileTreeFocusInfo);
			this.fileTreesByResponseId.set(context.element.id, distinct(fileTrees, (v) => v.treeDataId));
			treePart.addDisposable(toDisposable(() => this.fileTreesByResponseId.set(context.element.id, fileTrees.filter(v => v.treeDataId !== data.uri.toString()))));
		}

		return treePart;
	}

	private renderCheckpoint(content: IChatCheckpointAdded): IChatContentPart {
		const checkpointPart = this._register(this.instantiationService.createInstance(CheckpointFlag, true, undefined));
		this._register(dom.addDisposableListener(checkpointPart.domNode, dom.EventType.CLICK, async (e: MouseEvent) => {
			this.commandService.executeCommand('workbench.action.aideAgent.revert', { sessionId: content.sessionId, exchangeId: content.exchangeId });
		}));
		return checkpointPart;
	}

	private renderRollbackCompleted(content: IChatRollbackCompleted): IChatContentPart {
		const collapsedExchangesPart = this.instantiationService.createInstance(CollapsedExchangesContentPart, content);
		return collapsedExchangesPart;
	}

	private renderContentReferencesListData(references: IChatReferences, labelOverride: string | undefined, context: IChatContentPartRenderContext, templateData: IAgentListItemTemplate): ChatCollapsibleListContentPart {
		const referencesPart = this.instantiationService.createInstance(ChatCollapsibleListContentPart, references.references, labelOverride, context.element as IChatResponseViewModel, this._contentReferencesListPool);
		referencesPart.addDisposable(referencesPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));

		return referencesPart;
	}

	private renderCodeCitationsListData(citations: IChatCodeCitations, context: IChatContentPartRenderContext, templateData: IAgentListItemTemplate): ChatCodeCitationContentPart {
		const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
		return citationsPart;
	}

	private renderProgressTask(task: IChatTask, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart | undefined {
		if (!isResponseVM(context.element)) {
			return;
		}

		const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.renderer, context);
		taskPart.addDisposable(taskPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return taskPart;
	}

	private renderConfirmation(context: IChatContentPartRenderContext, confirmation: IChatConfirmation, templateData: IAgentListItemTemplate): IChatContentPart {
		const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
		part.addDisposable(part.onDidChangeHeight(() => this.updateItemHeight(templateData)));
		return part;
	}

	private renderAttachments(variables: IChatRequestVariableEntry[], contentReferences: ReadonlyArray<IChatContentReference> | undefined, templateData: IAgentListItemTemplate) {
		const attachmentPart = this.instantiationService.createInstance(ChatAttachmentsContentPart, variables, contentReferences);
		attachmentPart.addDisposable(attachmentPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return attachmentPart;
	}

	private renderTextEdit(context: IChatContentPartRenderContext, chatTextEdit: IChatTextEditGroup, templateData: IAgentListItemTemplate): IChatContentPart {
		const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth);
		textEditPart.addDisposable(textEditPart.onDidChangeHeight(() => {
			textEditPart.layout(this._currentLayoutWidth);
			this.updateItemHeight(templateData);
		}));

		return textEditPart;
	}

	private renderCodeEdit(context: IChatContentPartRenderContext, edits: IChatCodeEdits, templateData: IAgentListItemTemplate): IChatContentPart {
		const codeEditPart = this.instantiationService.createInstance(AideAgentCodeEditContentPart, context, edits, this._codeEditsPool);
		codeEditPart.addDisposable(codeEditPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return codeEditPart;
	}

	private renderMarkdown(markdown: IMarkdownString, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext, width = this._currentLayoutWidth): IChatContentPart {
		const element = context.element;
		const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
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
					codeBlockStartIndex = codeBlockStartIndex + value.codeblocks.length + value.editPreviewBlocks.length;
				}
			}
		}

		const markdownPart = this.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, this._editPreviewEditorPool, fillInIncompleteTokens, codeBlockStartIndex, this.renderer, width, this.codeBlockModelCollection, this.rendererOptions);
		const markdownPartId = markdownPart.id;
		markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => {
			markdownPart.layout(width);
			this.updateItemHeight(templateData);
		}));

		// Code blocks
		const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
		this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
		markdownPart.addDisposable(toDisposable(() => {
			const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id);
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

		// Edit previews
		const editPreviewBlocksByResponseId = this.editPreviewBlocksByResponseId.get(element.id) ?? [];
		this.editPreviewBlocksByResponseId.set(element.id, editPreviewBlocksByResponseId);
		markdownPart.addDisposable(toDisposable(() => {
			const editPreviewBlocksByResponseId = this.editPreviewBlocksByResponseId.get(element.id);
			if (editPreviewBlocksByResponseId) {
				markdownPart.editPreviewBlocks.forEach((info, i) => {
					const editPreviewBlock = editPreviewBlocksByResponseId[codeBlockStartIndex + i];
					if (editPreviewBlock?.ownerMarkdownPartId === markdownPartId) {
						delete editPreviewBlocksByResponseId[codeBlockStartIndex + i];
					}
				});
			}
		}));

		markdownPart.editPreviewBlocks.forEach((info, i) => {
			editPreviewBlocksByResponseId[codeBlockStartIndex + i] = info;
		});

		return markdownPart;
	}

	private renderEdits(edits: IChatEditsInfo, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext, sessionId: string, exchangeId: string) {
		let descriptionPart: ChatMarkdownContentPart | undefined;
		if (edits.description) {
			descriptionPart = this.renderMarkdown(edits.description, templateData, context) as ChatMarkdownContentPart;
		}
		const editsContentPart = this.instantiationService.createInstance(EditsContentPart, edits, descriptionPart);
		editsContentPart.addDisposable(editsContentPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return editsContentPart;
	}


	private renderPlanInfo(plan: IChatPlanInfo, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext, sessionId: string, exchangeId: string) {
		let descriptionPart: ChatMarkdownContentPart | undefined;
		if (plan.description) {
			descriptionPart = this.renderMarkdown(plan.description, templateData, context) as ChatMarkdownContentPart;
		}
		const planContentPart = this.instantiationService.createInstance(PlanContentPart, plan, descriptionPart);
		planContentPart.addDisposable(planContentPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
		}));
		return planContentPart;
	}

	private renderPlanStep(step: IChatPlanStep, templateData: IAgentListItemTemplate, context: IChatContentPartRenderContext): IChatContentPart {

		const descriptionPart = this.renderMarkdown(step.description, templateData, context) as ChatMarkdownContentPart;
		const stepPart = this.instantiationService.createInstance(ChatPlanStepPart, step, descriptionPart);

		stepPart.addDisposable(stepPart.onDidChangeHeight(() => {
			this.updateItemHeight(templateData);
			descriptionPart.layout(this._currentLayoutWidth);
		}));

		if (isResponseVM(context.element)) {
			const planStepsFocusInfo: IChatPlanStepsInfo = {
				sessionId: step.sessionId,
				stepIndex: step.index,
				focus() {
					stepPart.domFocus();
				},
				blur() {
					stepPart.domBlur();
				},
				appendStep() {
					stepPart.appendStep();
				},
				dropStep() {
					stepPart.dropStep();
				},
				implementStep() {
					stepPart.implementStep();
				},
				expandStep() {
					stepPart.expandStep();
				},
			};

			// TODO@roblourens there's got to be a better way to navigate trees
			stepPart.addDisposable(stepPart.onDidFocus(() => {
				this.focusedPlanStepsByResponseId.set(context.element.id, planStepsFocusInfo.stepIndex);
			}));

			const planSteps = this.planStepsByResponseId.get(context.element.id) ?? [];
			planSteps.push(planStepsFocusInfo);
			this.planStepsByResponseId.set(context.element.id, distinct(planSteps, (v) => v.stepIndex));
			stepPart.addDisposable(toDisposable(() => this.planStepsByResponseId.set(context.element.id, planSteps.filter(v => v.sessionId !== step.sessionId))));
		}

		return stepPart;
	}

	disposeElement(node: ITreeNode<ChatTreeItem, FuzzyScore>, index: number, templateData: IAgentListItemTemplate): void {
		this.traceLayout('disposeElement', `Disposing element, index=${index}`);

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

	disposeTemplate(templateData: IAgentListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

export class ChatListDelegate implements IListVirtualDelegate<ChatTreeItem> {
	constructor(
		private readonly defaultElementHeight: number,
		@ILogService private readonly logService: ILogService
	) { }

	private _traceLayout(method: string, message: string) {
		if (forceVerboseLayoutTracing) {
			this.logService.info(`ChatListDelegate#${method}: ${message}`);
		} else {
			this.logService.trace(`ChatListDelegate#${method}: ${message}`);
		}
	}

	getHeight(element: ChatTreeItem): number {
		const kind = isRequestVM(element) ? 'request' : 'response';
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? this.defaultElementHeight;
		this._traceLayout('getHeight', `${kind}, height=${height}`);
		return height;
	}

	getTemplateId(element: ChatTreeItem): string {
		return ChatListItemRenderer.ID;
	}

	hasDynamicHeight(element: ChatTreeItem): boolean {
		return true;
	}
}

const voteDownDetailLabels: Record<ChatAgentVoteDownReason, string> = {
	[ChatAgentVoteDownReason.IncorrectCode]: localize('incorrectCode', "Suggested incorrect code"),
	[ChatAgentVoteDownReason.DidNotFollowInstructions]: localize('didNotFollowInstructions', "Didn't follow instructions"),
	[ChatAgentVoteDownReason.MissingContext]: localize('missingContext', "Missing context"),
	[ChatAgentVoteDownReason.OffensiveOrUnsafe]: localize('offensiveOrUnsafe', "Offensive or unsafe"),
	[ChatAgentVoteDownReason.PoorlyWrittenOrFormatted]: localize('poorlyWrittenOrFormatted', "Poorly written or formatted"),
	[ChatAgentVoteDownReason.RefusedAValidRequest]: localize('refusedAValidRequest', "Refused a valid request"),
	[ChatAgentVoteDownReason.IncompleteCode]: localize('incompleteCode', "Incomplete code"),
	[ChatAgentVoteDownReason.WillReportIssue]: localize('reportIssue', "Report an issue"),
	[ChatAgentVoteDownReason.Other]: localize('other', "Other"),
};


export class PlanStepViewActionItem extends MenuEntryActionViewItem {

	_providedOnPreview?: () => void;
	set onPreview(value: () => void) {
		this._providedOnPreview = value;
	}
	_onPreview() {
		if (this._providedOnPreview) {
			this._providedOnPreview();
		}
	}

	set onDismiss(value: () => void) {
		this._providedOnDismiss = value;
	}
	_providedOnDismiss?: () => void;
	_onDismiss() {
		if (this._providedOnDismiss) {
			this._providedOnDismiss();
		}
	}

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(
			action,
			options,
			keybindingService,
			notificationService,
			contextKeyService,
			themeService,
			contextMenuService,
			accessibilityService
		);
	}



	override render(container: HTMLElement) {
		super.render(container);

		this._register(dom.addDisposableListener(container, dom.EventType.MOUSE_ENTER, this._onPreview));
		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, this._onPreview));

		this._register(dom.addDisposableListener(container, dom.EventType.MOUSE_LEAVE, this._onDismiss));
		this._register(dom.addDisposableListener(container, dom.EventType.BLUR, this._onDismiss));
	}
}

export class ChatVoteDownButton extends DropdownMenuActionViewItem {
	constructor(
		action: IAction,
		options: IDropdownMenuActionViewItemOptions | undefined,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService,
		@ILogService private readonly logService: ILogService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(action,
			{ getActions: () => this.getActions(), },
			contextMenuService,
			{
				...options,
				classNames: ThemeIcon.asClassNameArray(Codicon.thumbsdown),
			});
	}

	getActions(): readonly IAction[] {
		return [
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.IncorrectCode),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.DidNotFollowInstructions),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.IncompleteCode),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.MissingContext),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.PoorlyWrittenOrFormatted),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.RefusedAValidRequest),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.OffensiveOrUnsafe),
			this.getVoteDownDetailAction(ChatAgentVoteDownReason.Other),
			{
				id: 'reportIssue',
				label: voteDownDetailLabels[ChatAgentVoteDownReason.WillReportIssue],
				tooltip: '',
				enabled: true,
				class: undefined,
				run: async (context: IChatResponseViewModel) => {
					if (!isResponseVM(context)) {
						this.logService.error('ChatVoteDownButton#run: invalid context');
						return;
					}

					await this.commandService.executeCommand(MarkUnhelpfulActionId, context, ChatAgentVoteDownReason.WillReportIssue);
					await this.issueService.openReporter({ extensionId: context.agent?.extensionId.value });
				}
			}
		];
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.element?.classList.toggle('checked', this.action.checked);
	}

	private getVoteDownDetailAction(reason: ChatAgentVoteDownReason): IAction {
		const label = voteDownDetailLabels[reason];
		return {
			id: MarkUnhelpfulActionId,
			label,
			tooltip: '',
			enabled: true,
			checked: (this._context as IChatResponseViewModel).voteDownReason === reason,
			class: undefined,
			run: async (context: IChatResponseViewModel) => {
				if (!isResponseVM(context)) {
					this.logService.error('ChatVoteDownButton#getVoteDownDetailAction: invalid context');
					return;
				}

				await this.commandService.executeCommand(MarkUnhelpfulActionId, context, reason);
			}
		};
	}
}

/**
 * const partsToTest: AideAgentRichItem[] = [
				this.instantiationService.createInstance(EditsContentPart, { kind: 'edits', state: ChatEditsState.Loading, stale: false, files: [URI.parse('file:///usr/home')] }, undefined),
				this.instantiationService.createInstance(EditsContentPart, { kind: 'edits', state: ChatEditsState.InReview, stale: false, files: [URI.parse('file:///usr/home'), URI.parse('file:///usr/home')] }, undefined),
				this.instantiationService.createInstance(EditsContentPart, { kind: 'edits', state: ChatEditsState.MarkedComplete, stale: false, files: [] }, undefined),
				this.instantiationService.createInstance(EditsContentPart, { kind: 'edits', state: ChatEditsState.Cancelled, stale: false, files: [] }, undefined),
				this.instantiationService.createInstance(EditsContentPart, { kind: 'edits', state: ChatEditsState.MarkedComplete, stale: true, files: [] }, undefined),
			];

			for (const testPart of partsToTest) {
				templateData.value.appendChild(testPart.domNode);
				testPart.layout();
			}
 */
