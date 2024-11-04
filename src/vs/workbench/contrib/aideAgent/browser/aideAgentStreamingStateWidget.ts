/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar, HiddenItemStrategy } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatStreamingState, ChatStreamingState, ChatStreamingStateLoadingLabel } from '../common/aideAgentService.js';
import { Heroicon } from '../../../browser/heroicon.js';
import './media/aideAgentStreamingState.css';
import { URI } from '../../../../base/common/uri.js';
import { CONTEXT_STREAMING_STATE } from '../common/aideAgentContextKeys.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

const $ = dom.$;

type StreamingState = Omit<IChatStreamingState, 'kind' | 'sessionId' | 'exchangeId'> & Partial<Pick<IChatStreamingState, 'sessionId' | 'exchangeId'>>;

// If you end up here and are confued about the buttons and where they are coming from
// grep for `MenuId.AideAgentStreamingState` and follow the hits, the registration of commands
// happens using the `MenuId.AideAgentStreamingState` state
export class StreamingStateWidget extends Disposable {

	private rootElement: HTMLElement;
	private iconContainer: HTMLElement;
	private textLabelElement: HTMLElement;
	private toolbar: MenuWorkbenchToolBar;
	private _isVisible: boolean;

	constructor(
		streamingState: StreamingState,
		container: HTMLElement,
		initialIsVisible = false,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this._isVisible = initialIsVisible;
		this.rootElement = dom.append(container, $('.aide-streaming-state'));

		this.iconContainer = this.rootElement.appendChild($('span.aide-streaming-state-icon'));
		const iconLabel = this.iconContainer.appendChild($('span.aide-streaming-state-icon-label.sr-only'));
		iconLabel.textContent = localize('aideAgent.streamingState.error', "Error");
		this._register(this.instantiationService.createInstance(Heroicon, this.iconContainer, 'micro/exclamation-triangle'));

		this.textLabelElement = this.rootElement.appendChild($('span.aide-streaming-state-label'));

		const toolbarContainer = dom.append(this.rootElement, $('.aide-streaming-state-toolbar-container'));

		CONTEXT_STREAMING_STATE.bindTo(this.contextKeyService);

		this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AideAgentStreamingState, {
			menuOptions: { shouldForwardArgs: true },
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			actionViewItemProvider: (action) => {
				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
				}
				return undefined;
			}
		}));

		this.update(streamingState, true);
		if (this._isVisible) {
			this.show();
		} else {
			this.hide();
		}
	}

	private updateLabel(state: StreamingState) {
		// if (state.message) {
		// 	this.textLabelElement.textContent = state.message;
		// 	return;
		// }

		if (state.state === ChatStreamingState.Loading) {
			let label = localize('aideAgent.streamingState.generalLoading', "Loading");
			switch (state.loadingLabel) {
				case ChatStreamingStateLoadingLabel.Reasoning:
					label = localize('aideAgent.streamingState.thinking', "Thinking");
					break;
				case ChatStreamingStateLoadingLabel.ExploringCodebase:
					label = localize('aideAgent.streamingState.exploring', "Exploring codebase");
					break;
				case ChatStreamingStateLoadingLabel.Generating:
					label = localize('aideAgent.streamingState.generating', "Generating");
					break;
				default:
					break;
			}
			this.textLabelElement.textContent = label;
		} else if (state.state === ChatStreamingState.WaitingFeedback) {
			this.textLabelElement.textContent = localize('aideAgent.streamingState.waitingFeedback', "Waiting for feedback");
		} else if (state.state === ChatStreamingState.EditsStarted) {
			const files = state.files.map((file) => {
				const uri = URI.file(file);
				const segments = uri.path.split('/');
				if (segments.length === 0) {
					return file;
				}
				const basename = segments[segments.length - 1];
				return basename;
			}).join(' ,');
			const filesMessage = `Editing ${files} ...`.toString();
			this.textLabelElement.textContent = filesMessage;
		}
	}

	update(newState: StreamingState, quiet = false) {

		this.toolbar.context = {
			'aideAgentSessionId': newState.sessionId,
			'aideAgentExchangeId': newState.exchangeId,
		};

		if (!quiet && !this._isVisible) {
			this.show();
		}
		if (newState.isError) {
			this.rootElement.classList.add('aide-streaming-state-error');
			this.iconContainer.ariaHidden = 'false';
		} else {
			this.rootElement.classList.remove('aide-streaming-state-error');
			this.iconContainer.ariaHidden = 'true';
		}

		if (newState.message || newState.isError || newState.state === ChatStreamingState.WaitingFeedback || newState.state === ChatStreamingState.EditsStarted) {
			this.textLabelElement.classList.remove('aide-streaming-state-label-ellipsis');
		} else {
			this.textLabelElement.classList.add('aide-streaming-state-label-ellipsis');
		}
		this.updateLabel(newState);
	}

	show() {
		this._isVisible = true;
		this.rootElement.classList.remove('aide-streaming-state-hidden');
		this.rootElement.ariaHidden = 'false';
	}

	hide() {
		this.rootElement.ariaHidden = 'true';
		this.rootElement.classList.add('aide-streaming-state-hidden');
		// manually set the _isVisible toggle over here
		this._isVisible = false;
	}
}
