/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { HistoryNavigator2 } from 'vs/base/common/history';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { basename, dirname } from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ActionViewItemWithKb } from 'vs/platform/actionbarWithKeybindings/browser/actionViewItemWithKb';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IAIModelSelectionService } from 'vs/platform/aiModel/common/aiModels';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { FileKind } from 'vs/platform/files/common/files';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { ClearChatEditorAction } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatClearActions';
import { CancelAction, IChatExecuteActionContext, SubmitAction } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatExecuteActions';
import { IChatRequester, IChatWidget } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { ChatFollowups } from 'vs/workbench/contrib/aideChat/browser/aideChatFollowups';
import { AideChatAgentLocation } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';
import { CONTEXT_CHAT_INPUT_CURSOR_AT_TOP, CONTEXT_CHAT_INPUT_HAS_FOCUS, CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/aideChat/common/aideChatContextKeys';
import { IAideChatRequestVariableEntry } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatFollowup } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { IChatResponseViewModel } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';
import { IAideChatWidgetHistoryService, IChatHistoryEntry } from 'vs/workbench/contrib/aideChat/common/aideChatWidgetHistoryService';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ModelSelectionIndicator } from 'vs/workbench/contrib/preferences/browser/modelSelectionIndicator';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const $ = dom.$;

const INPUT_EDITOR_MIN_HEIGHT = 100;

interface IChatInputPartOptions {
	renderFollowups: boolean;
	renderStyle?: 'default' | 'compact';
	menus: {
		executeToolbar: MenuId;
		primaryToolbar: MenuId;
		inputSideToolbar?: MenuId;
		telemetrySource?: string;
	};
	editorOverflowWidgetsDomNode?: HTMLElement;
}

export class ChatInputPart extends Disposable implements IHistoryNavigationWidget {
	static readonly INPUT_SCHEME = 'aideChatSessionInput';
	private static _counter = 0;

	private _onDidLoadInputState = this._register(new Emitter<any>());
	readonly onDidLoadInputState = this._onDidLoadInputState.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	private _onDidDeleteContext = this._register(new Emitter<IAideChatRequestVariableEntry>());
	readonly onDidDeleteContext = this._onDidDeleteContext.event;

	private _onDidAcceptFollowup = this._register(new Emitter<{ followup: IAideChatFollowup; response: IChatResponseViewModel | undefined }>());
	readonly onDidAcceptFollowup = this._onDidAcceptFollowup.event;

	public get attachedContext() {
		return this._attachedContext;
	}

	private _indexOfLastAttachedContextDeletedWithKeyboard: number = -1;
	private readonly _attachedContext = new Set<IAideChatRequestVariableEntry>();

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	private inputEditorHeight = 0;
	private container!: HTMLElement;

	private inputSideToolbarContainer?: HTMLElement;

	private followupsContainer!: HTMLElement;
	private readonly followupsDisposables = this._register(new DisposableStore());

	private attachedContextContainer!: HTMLElement;
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private _inputPartHeight: number = 0;
	get inputPartHeight() {
		return this._inputPartHeight;
	}

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	protected requesterContainer: HTMLElement | undefined;
	protected modelNameContainer: HTMLElement | undefined;

	private toolbar!: MenuWorkbenchToolBar;
	private primaryToolbar!: MenuWorkbenchToolBar;

	get inputEditor() {
		return this._inputEditor;
	}

	private history: HistoryNavigator2<IChatHistoryEntry>;
	private historyNavigationBackwardsEnablement!: IContextKey<boolean>;
	private historyNavigationForewardsEnablement!: IContextKey<boolean>;
	private inHistoryNavigation = false;
	private inputModel: ITextModel | undefined;
	private inputEditorHasText: IContextKey<boolean>;
	private chatCursorAtTop: IContextKey<boolean>;
	private inputEditorHasFocus: IContextKey<boolean>;

	private cachedDimensions: dom.Dimension | undefined;
	private cachedToolbarWidth: number | undefined;

	readonly inputUri = URI.parse(`${ChatInputPart.INPUT_SCHEME}:input-${ChatInputPart._counter++}`);

	constructor(
		// private readonly editorOptions: ChatEditorOptions, // TODO this should be used
		private readonly location: AideChatAgentLocation,
		private readonly options: IChatInputPartOptions,
		@IAideChatWidgetHistoryService private readonly historyService: IAideChatWidgetHistoryService,
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAIModelSelectionService private readonly aiModelSelectionService: IAIModelSelectionService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this.inputEditorHasText = CONTEXT_CHAT_INPUT_HAS_TEXT.bindTo(contextKeyService);
		this.chatCursorAtTop = CONTEXT_CHAT_INPUT_CURSOR_AT_TOP.bindTo(contextKeyService);
		this.inputEditorHasFocus = CONTEXT_CHAT_INPUT_HAS_FOCUS.bindTo(contextKeyService);

		this.history = this.loadHistory();
		this._register(this.historyService.onDidClearHistory(() => this.history = new HistoryNavigator2([{ text: '' }], 50, historyKeyFn)));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));
		this._register(this.aiModelSelectionService.onDidChangeModelSelection(() => {
			this._renderModelName();
		}));
	}

	private loadHistory(): HistoryNavigator2<IChatHistoryEntry> {
		const history = this.historyService.getHistory(this.location);
		if (history.length === 0) {
			history.push({ text: '' });
		}

		return new HistoryNavigator2(history, 50, historyKeyFn);
	}

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel ? localize('actions.chat.accessibiltyHelp', "Chat Input,  Type to ask questions or type / for topics, press enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize('aideChatInput.accessibilityHelpNoKb', "Chat Input,  Type code here and press Enter to run. Use the Chat Accessibility Help command for more information.");
		}
		return localize('aideChatInput', "Chat Input");
	}

	updateState(inputState: Object): void {
		if (this.inHistoryNavigation) {
			return;
		}

		const newEntry = { text: this._inputEditor.getValue(), state: inputState };

		if (this.history.isAtEnd()) {
			// The last history entry should always be the current input value
			this.history.replaceLast(newEntry);
		} else {
			// Added a reference while in the middle of history navigation, it's a new entry
			this.history.replaceLast(newEntry);
			this.history.resetCursor();
		}
	}

	initForNewChatModel(inputValue: string | undefined, inputState: Object): void {
		this.history = this.loadHistory();
		this.history.add({ text: inputValue ?? this.history.current().text, state: inputState });

		if (inputValue) {
			this.setValue(inputValue, false);
		}
	}

	logInputHistory(): void {
		const historyStr = [...this.history].map(entry => JSON.stringify(entry)).join('\n');
		this.logService.info(`[${this.location}] Chat input history:`, historyStr);
	}

	setVisible(visible: boolean): void {
		this._onDidChangeVisibility.fire(visible);
	}

	get element(): HTMLElement {
		return this.container;
	}

	showPreviousValue(): void {
		if (this.history.isAtEnd()) {
			this.saveCurrentValue();
		} else {
			if (!this.history.has({ text: this._inputEditor.getValue(), state: this.history.current().state })) {
				this.saveCurrentValue();
				this.history.resetCursor();
			}
		}

		this.navigateHistory(true);
	}

	showNextValue(): void {
		if (this.history.isAtEnd()) {
			return;
		} else {
			if (!this.history.has({ text: this._inputEditor.getValue(), state: this.history.current().state })) {
				this.saveCurrentValue();
				this.history.resetCursor();
			}
		}

		this.navigateHistory(false);
	}

	private navigateHistory(previous: boolean): void {
		const historyEntry = previous ?
			this.history.previous() : this.history.next();

		aria.status(historyEntry.text);

		this.inHistoryNavigation = true;
		this.setValue(historyEntry.text, true);
		this.inHistoryNavigation = false;

		this._onDidLoadInputState.fire(historyEntry.state);
		if (previous) {
			this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			this._inputEditor.setPosition(getLastPosition(model));
		}
	}

	setValue(value: string, transient: boolean): void {
		this.inputEditor.setValue(value);
		// always leave cursor at the end
		this.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });

		if (!transient) {
			this.saveCurrentValue();
		}
	}

	private saveCurrentValue(): void {
		const newEntry = { text: this._inputEditor.getValue(), state: this.history.current().state };
		this.history.replaceLast(newEntry);
	}

	focus() {
		this._inputEditor.focus();
	}

	hasFocus(): boolean {
		return this._inputEditor.hasWidgetFocus();
	}

	/**
	 * Reset the input and update history.
	 * @param userQuery If provided, this will be added to the history. Followups and programmatic queries should not be passed.
	 */
	async acceptInput(isUserQuery?: boolean): Promise<void> {
		if (isUserQuery) {
			const userQuery = this._inputEditor.getValue();
			const entry: IChatHistoryEntry = { text: userQuery, state: this.history.current().state };
			this.history.replaceLast(entry);
			this.history.add({ text: '' });
		}

		this._onDidLoadInputState.fire({});
		if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
			this._acceptInputForVoiceover();
		} else {
			this._inputEditor.focus();
			this._inputEditor.setValue('');
		}
	}

	private _acceptInputForVoiceover(): void {
		const domNode = this._inputEditor.getDomNode();
		if (!domNode) {
			return;
		}
		// Remove the input editor from the DOM temporarily to prevent VoiceOver
		// from reading the cleared text (the request) to the user.
		domNode.remove();
		this._inputEditor.setValue('');
		this._inputEditorElement.appendChild(domNode);
		this._inputEditor.focus();
	}

	attachContext(...contentReferences: IAideChatRequestVariableEntry[]): void {
		for (const reference of contentReferences) {
			this.attachedContext.add(reference);
		}

		this.initAttachedContext(this.attachedContextContainer);
	}

	render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		this.container = dom.append(container, $('.cschat-input-part'));
		this.container.classList.toggle('compact', this.options.renderStyle === 'compact');

		const secondChild = this.container.childNodes[1];
		const header = $('.header');
		this.container.insertBefore(header, secondChild);
		const user = dom.append(header, $('.user'));

		const model = new Button($('.slow-model'), {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		});
		model.onDidClick(() => {
			this.commandService.executeCommand(ModelSelectionIndicator.SWITCH_SLOW_MODEL_COMMAND_ID);
		});
		this._renderModelName();

		dom.append(header, model.element);
		dom.append(user, $('.avatar-container'));
		dom.append(user, $('h3.username'));
		this.requesterContainer = user;
		this.modelNameContainer = model.element;
		this.modelNameContainer.style.display = 'none';
		this._renderRequester();

		this.followupsContainer = dom.append(this.container, $('.interactive-input-followups'));
		this.attachedContextContainer = dom.append(this.container, $('.chat-attached-context'));
		this.initAttachedContext(this.attachedContextContainer);
		const inputAndSideToolbar = dom.append(this.container, $('.interactive-input-and-side-toolbar'));
		const inputContainer = dom.append(inputAndSideToolbar, $('.interactive-input-and-execute-toolbar'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_CHAT_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;

		const options: IEditorConstructionOptions = getSimpleEditorOptions(this.configurationService);
		options.overflowWidgetsDomNode = this.options.editorOverflowWidgetsDomNode;
		options.readOnly = false;
		options.ariaLabel = this._getAriaLabel();
		options.fontFamily = EDITOR_FONT_DEFAULTS.fontFamily;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = this.options.renderStyle === 'compact' ? { top: 2, bottom: 2 } : { top: 8, bottom: 8 };
		options.cursorWidth = 3;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };
		options.suggest = {
			showIcons: false,
			showSnippets: false,
			showWords: true,
			showStatusBar: false,
			insertMode: 'replace',
		};
		options.scrollbar = { ...(options.scrollbar ?? {}), vertical: 'hidden' };

		this._inputEditorElement = dom.append(inputContainer, $('.interactive-input-editor'));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([HoverController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));

		this._register(this._inputEditor.onDidChangeModelContent(() => {
			const currentHeight = Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT);
			if (currentHeight !== this.inputEditorHeight) {
				this.inputEditorHeight = currentHeight;
				this._onDidChangeHeight.fire();
			}

			const model = this._inputEditor.getModel();
			const inputHasText = !!model && model.getValue().trim().length > 0;
			this.inputEditorHasText.set(inputHasText);
		}));
		this._register(this._inputEditor.onDidFocusEditorText(() => {
			this.inputEditorHasFocus.set(true);
			this._onDidFocus.fire();
			inputContainer.classList.toggle('focused', true);
		}));
		this._register(this._inputEditor.onDidBlurEditorText(() => {
			this.inputEditorHasFocus.set(false);
			inputContainer.classList.toggle('focused', false);

			this._onDidBlur.fire();
		}));
		this._register(this._inputEditor.onDidChangeCursorPosition(e => {
			const model = this._inputEditor.getModel();
			if (!model) {
				return;
			}

			const atTop = e.position.column === 1 && e.position.lineNumber === 1;
			this.chatCursorAtTop.set(atTop);

			this.historyNavigationBackwardsEnablement.set(atTop);
			this.historyNavigationForewardsEnablement.set(e.position.equals(getLastPosition(model)));
		}));

		const toolbarsContainer = dom.append(inputContainer, $('.interactive-input-toolbars'));

		this.primaryToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.primaryToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
		this.primaryToolbar.getElement().classList.add('interactive-aide-toolbar');
		this.primaryToolbar.context = { widget } satisfies IChatExecuteActionContext;

		this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
			telemetrySource: this.options.menus.telemetrySource,
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore, // keep it lean when hiding items and avoid a "..." overflow menu
			actionViewItemProvider: (action, options) => {
				if (this.location === AideChatAgentLocation.Panel) {
					if ((action.id === SubmitAction.ID || action.id === CancelAction.ID || action.id === ClearChatEditorAction.ID) && action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(ActionViewItemWithKb, action);
					}
				}

				return undefined;
			}
		}));
		this.toolbar.getElement().classList.add('interactive-execute-toolbar');
		this.toolbar.context = { widget } satisfies IChatExecuteActionContext;
		this._register(this.toolbar.onDidChangeMenuItems(() => {
			if (this.cachedDimensions && typeof this.cachedToolbarWidth === 'number' && this.cachedToolbarWidth !== this.toolbar.getItemsWidth()) {
				this.layout(this.cachedDimensions.height, this.cachedDimensions.width);
			}
		}));

		if (this.options.menus.inputSideToolbar) {
			const toolbarSide = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputAndSideToolbar, this.options.menus.inputSideToolbar, {
				telemetrySource: this.options.menus.telemetrySource,
				menuOptions: {
					shouldForwardArgs: true
				}
			}));
			this.inputSideToolbarContainer = toolbarSide.getElement();
			toolbarSide.getElement().classList.add('chat-side-toolbar');
			toolbarSide.context = { widget } satisfies IChatExecuteActionContext;
		}

		let inputModel = this.modelService.getModel(this.inputUri);
		if (!inputModel) {
			inputModel = this.modelService.createModel('', null, this.inputUri, true);
			this._register(inputModel);
		}

		this.inputModel = inputModel;
		this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
		this._inputEditor.setModel(this.inputModel);
		if (initialValue) {
			this.inputModel.setValue(initialValue);
			const lineNumber = this.inputModel.getLineCount();
			this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
		}
	}

	private initAttachedContext(container: HTMLElement) {
		dom.clearNode(container);
		this.attachedContextDisposables.clear();
		dom.setVisibility(Boolean(this.attachedContext.size), this.attachedContextContainer);
		if (!this.attachedContext.size) {
			this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
		}
		[...this.attachedContext.values()].forEach((attachment, index) => {
			const widget = dom.append(container, $('.chat-attached-context-attachment.show-file-icons'));
			const label = this._contextResourceLabels.create(widget, { supportIcons: true });
			const file = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;
			if (file && attachment.isFile) {
				const fileBasename = basename(file.path);
				const fileDirname = dirname(file.path);
				const friendlyName = `${fileBasename} ${fileDirname}`;
				const ariaLabel = range ? localize('aideChat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('aideChat.fileAttachment', "Attached file, {0}", friendlyName);

				label.setFile(file, {
					fileKind: FileKind.FILE,
					hidePath: true,
					range,
				});
				widget.ariaLabel = ariaLabel;
				widget.tabIndex = 0;
			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				label.setLabel(attachmentLabel, undefined);

				widget.ariaLabel = localize('aideChat.attachment', "Attached context, {0}", attachment.name);
				widget.tabIndex = 0;
			}

			const clearButton = new Button(widget, { supportIcons: true });

			// If this item is rendering in place of the last attached context item, focus the clear button so the user can continue deleting attached context items with the keyboard
			if (index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, this.attachedContext.size - 1)) {
				clearButton.focus();
			}

			this.attachedContextDisposables.add(clearButton);
			clearButton.icon = Codicon.close;
			const disp = clearButton.onDidClick((e) => {
				this.attachedContext.delete(attachment);
				disp.dispose();

				// Set focus to the next attached context item if deletion was triggered by a keystroke (vs a mouse click)
				if (dom.isKeyboardEvent(e)) {
					const event = new StandardKeyboardEvent(e);
					if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
						this._indexOfLastAttachedContextDeletedWithKeyboard = index;
					}
				}

				this._onDidChangeHeight.fire();
				this._onDidDeleteContext.fire(attachment);
			});
			this.attachedContextDisposables.add(disp);
		});
	}

	async renderFollowups(items: IAideChatFollowup[] | undefined, response: IChatResponseViewModel | undefined): Promise<void> {
		if (!this.options.renderFollowups) {
			return;
		}
		this.followupsDisposables.clear();
		dom.clearNode(this.followupsContainer);

		if (items && items.length > 0) {
			this.followupsDisposables.add(this.instantiationService.createInstance<typeof ChatFollowups<IAideChatFollowup>, ChatFollowups<IAideChatFollowup>>(ChatFollowups, this.followupsContainer, items, this.location, undefined, followup => this._onDidAcceptFollowup.fire({ followup, response })));
		}
		this._onDidChangeHeight.fire();
	}

	get contentHeight(): number {
		const data = this.getLayoutData();
		return data.followupsHeight + data.inputPartEditorHeight + data.inputPartVerticalPadding + data.inputEditorBorder + data.implicitContextHeight;
	}

	layout(height: number, width: number) {
		this.cachedDimensions = new dom.Dimension(width, height);

		return this._layout(height, width);
	}

	private previousInputEditorDimension: IDimension | undefined;
	private _layout(height: number, width: number, allowRecurse = true): void {
		this.initAttachedContext(this.attachedContextContainer);

		const data = this.getLayoutData();

		const inputEditorHeight = Math.min(data.inputPartEditorHeight, height - data.followupsHeight - data.inputPartVerticalPadding);

		const followupsWidth = width - data.inputPartHorizontalPadding;
		this.followupsContainer.style.width = `${followupsWidth}px`;

		this._inputPartHeight = data.followupsHeight + inputEditorHeight + data.inputPartVerticalPadding + data.inputEditorBorder + data.implicitContextHeight + data.executeToolbarHeight;

		const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
		const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.editorPadding - data.executeToolbarWidth - data.sideToolbarWidth - data.toolbarPadding;
		const newDimension = { width: newEditorWidth, height: inputEditorHeight };
		if (!this.previousInputEditorDimension || (this.previousInputEditorDimension.width !== newDimension.width || this.previousInputEditorDimension.height !== newDimension.height)) {
			// This layout call has side-effects that are hard to understand. eg if we are calling this inside a onDidChangeContent handler, this can trigger the next onDidChangeContent handler
			// to be invoked, and we have a lot of these on this editor. Only doing a layout this when the editor size has actually changed makes it much easier to follow.
			this._inputEditor.layout(newDimension);
			this.previousInputEditorDimension = newDimension;
		}

		if (allowRecurse && initialEditorScrollWidth < 10) {
			// This is probably the initial layout. Now that the editor is layed out with its correct width, it should report the correct contentHeight
			return this._layout(height, width, false);
		}
	}

	private getLayoutData() {
		return {
			inputEditorBorder: 0,
			followupsHeight: this.followupsContainer.offsetHeight,
			inputPartEditorHeight: Math.max(this._inputEditor.getContentHeight(), INPUT_EDITOR_MIN_HEIGHT),
			inputPartHorizontalPadding: 24,
			inputPartVerticalPadding: 46,
			implicitContextHeight: this.attachedContextContainer.offsetHeight,
			editorBorder: 0,
			editorPadding: 12,
			toolbarPadding: 4,
			executeToolbarHeight: dom.getTotalHeight(this.toolbar.getElement()),
			executeToolbarWidth: 0,
			sideToolbarWidth: this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) + 4 /*gap*/ : 0,
		};
	}

	saveState(): void {
		const inputHistory = [...this.history];
		this.historyService.saveHistory(this.location, inputHistory);
	}

	private _renderRequester(requester?: IChatRequester): void {
		const username = requester?.username || localize('requester', "You");
		if (!this.requesterContainer) {
			return;
		}

		this.requesterContainer.querySelector('h3.username')!.textContent = username;

		const avatarContainer = this.requesterContainer.querySelector('.avatar-container')!;
		if (requester?.avatarIconUri) {
			const avatarImgIcon = $<HTMLImageElement>('img.icon');
			avatarImgIcon.src = FileAccess.uriToBrowserUri(requester.avatarIconUri).toString(true);
			avatarContainer.replaceChildren($('.avatar', undefined, avatarImgIcon));
		} else {
			this.extensionService.getExtension('codestory-ghost.codestoryai').then((ext) => {
				if (ext?.extensionLocation) {
					const iconUri = URI.joinPath(ext.extensionLocation, 'assets', 'aide-user.png');
					const avatarImgIcon = $<HTMLImageElement>('img.icon');
					avatarImgIcon.src = FileAccess.uriToBrowserUri(iconUri).toString(true);
					avatarContainer.replaceChildren($('.avatar', undefined, avatarImgIcon));
				}
			}).catch(() => {
				const defaultIcon = Codicon.account;
				const avatarIcon = $(ThemeIcon.asCSSSelector(defaultIcon));
				avatarContainer.replaceChildren($('.avatar.codicon-avatar', undefined, avatarIcon));
			});
		}
	}

	private async _renderModelName(): Promise<void> {
		if (!this.modelNameContainer) {
			return;
		}

		const modelSelectionSettings = await this.aiModelSelectionService.getValidatedModelSelectionSettings();
		const modelName = modelSelectionSettings.models[modelSelectionSettings.slowModel].name;

		if (modelName) {
			this.modelNameContainer.textContent = modelName;
			this.modelNameContainer.style.display = 'block';
		} else {
			this.modelNameContainer.style.display = 'none';
		}
	}
}

const historyKeyFn = (entry: IChatHistoryEntry) => JSON.stringify(entry);

function getLastPosition(model: ITextModel): IPosition {
	return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
