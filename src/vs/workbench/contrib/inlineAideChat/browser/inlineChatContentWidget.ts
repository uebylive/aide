/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatContentWidget.css';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import * as dom from '../../../../base/browser/dom.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { inlineChatBackground, InlineChatConfigKeys, MENU_INLINE_CHAT_CONTENT_STATUS, MENU_INLINE_CHAT_EXECUTE } from '../../../../workbench/contrib/inlineAideChat/common/inlineChat.js';
import { Session } from '../../../../workbench/contrib/inlineAideChat/browser/inlineChatSession.js';
import { ChatWidget } from '../../../../workbench/contrib/aideChat/browser/aideChatWidget.js';
import { AideChatAgentLocation } from '../../../../workbench/contrib/aideChat/common/aideChatAgents.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { ChatModel } from '../../../../workbench/contrib/aideChat/common/aideChatModel.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { TextOnlyMenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class InlineChatContentWidget implements IContentWidget {

	readonly suppressMouseDown = false;
	readonly allowEditorOverflow = true;

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');
	private readonly _inputContainer = document.createElement('div');
	private readonly _toolbarContainer = document.createElement('div');

	private _position?: IPosition;

	private readonly _onDidBlur = this._store.add(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	private _visible: boolean = false;
	private _focusNext: boolean = false;

	private readonly _defaultChatModel: ChatModel;
	private readonly _widget: ChatWidget;

	constructor(
		location: AideChatAgentLocation,
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService
	) {

		this._defaultChatModel = this._store.add(instaService.createInstance(ChatModel, undefined, AideChatAgentLocation.Editor));

		const scopedInstaService = instaService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._store.add(contextKeyService.createScoped(this._domNode))
			]),
			this._store
		);

		this._widget = scopedInstaService.createInstance(
			ChatWidget,
			location,
			{ resource: true },
			{
				defaultElementHeight: 32,
				editorOverflowWidgetsDomNode: _editor.getOverflowWidgetsDomNode(),
				renderStyle: 'minimal',
				renderInputOnTop: true,
				renderFollowups: true,
				supportsFileReferences: false,
				menus: {
					telemetrySource: 'inlineChat-content',
					executeToolbar: MENU_INLINE_CHAT_EXECUTE,
				},
				filter: _item => false
			},
			{
				listForeground: editorForeground,
				listBackground: inlineChatBackground,
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground
			}
		);
		this._store.add(this._widget);
		this._widget.render(this._inputContainer);
		this._widget.setModel(this._defaultChatModel, {});
		this._store.add(this._widget.onDidChangeContentHeight(() => _editor.layoutContentWidget(this)));

		this._domNode.tabIndex = -1;
		this._domNode.className = 'inline-chat-content-widget cschat-session';

		this._domNode.appendChild(this._inputContainer);

		this._toolbarContainer.classList.add('toolbar');
		if (!configurationService.getValue<boolean>(InlineChatConfigKeys.ExpTextButtons)) {
			this._toolbarContainer.style.display = 'none';
			this._domNode.style.paddingBottom = '6px';
		}
		this._domNode.appendChild(this._toolbarContainer);

		this._store.add(scopedInstaService.createInstance(MenuWorkbenchToolBar, this._toolbarContainer, MENU_INLINE_CHAT_CONTENT_STATUS, {
			actionViewItemProvider: action => action instanceof MenuItemAction ? instaService.createInstance(TextOnlyMenuEntryActionViewItem, action, { conversational: true }) : undefined,
			toolbarOptions: { primaryGroup: '0_main' },
			icon: false,
			label: true,
		}));

		const tracker = dom.trackFocus(this._domNode);
		this._store.add(tracker.onDidBlur(() => {
			if (this._visible && this._widget.inputEditor.getModel()?.getValueLength() === 0
				// && !"ON"
			) {
				this._onDidBlur.fire();
			}
		}));
		this._store.add(tracker);
	}

	dispose(): void {
		this._store.dispose();
	}

	getId(): string {
		return 'inline-chat-content-widget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._position) {
			return null;
		}
		return {
			position: this._position,
			preference: [ContentWidgetPositionPreference.ABOVE]
		};
	}

	beforeRender(): IDimension | null {

		const maxHeight = this._widget.input.inputEditor.getOption(EditorOption.lineHeight) * 5;
		const inputEditorHeight = this._widget.contentHeight;

		this._widget.layout(Math.min(maxHeight, inputEditorHeight), 390);

		// const actualHeight = this._widget.inputPartHeight;
		// return new dom.Dimension(width, actualHeight);
		return null;
	}

	afterRender(): void {
		if (this._focusNext) {
			this._focusNext = false;
			this._widget.focusInput();
		}
	}

	// ---

	get chatWidget(): ChatWidget {
		return this._widget;
	}

	get isVisible(): boolean {
		return this._visible;
	}

	get value(): string {
		return this._widget.inputEditor.getValue();
	}

	show(position: IPosition) {
		if (!this._visible) {
			this._visible = true;
			this._focusNext = true;

			this._editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(position), ScrollType.Immediate);
			this._widget.inputEditor.setValue('');

			const wordInfo = this._editor.getModel()?.getWordAtPosition(position);

			this._position = wordInfo ? new Position(position.lineNumber, wordInfo.startColumn) : position;
			this._editor.addContentWidget(this);
			this._widget.setVisible(true);
		}
	}

	hide() {
		if (this._visible) {
			this._visible = false;
			this._editor.removeContentWidget(this);
			this._widget.saveState();
			this._widget.setVisible(false);
		}
	}

	setSession(session: Session): void {
		this._widget.setModel(session.chatModel, {});
		this._widget.setInputPlaceholder(session.agent.description ?? '');
	}
}
