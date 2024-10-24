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
import { IChatStreamingState, ChatStreamingState } from '../common/aideAgentService.js';
import { Heroicon } from '../../../browser/heroicon.js';
import './media/aideAgentStreamingState.css';

const $ = dom.$;


type StreamingState = Omit<IChatStreamingState, 'kind'>;

export class StreamingStateWidget extends Disposable {

	private rootElement: HTMLElement;
	private iconContainer: HTMLElement;
	private textLabelElement: HTMLElement;
	private _isVisible: boolean;

	get isVisible() {
		return this._isVisible;
	}

	constructor(
		streamingState: StreamingState,
		container: HTMLElement,
		initialIsVisible = false,
		@IInstantiationService private readonly instantiationService: IInstantiationService
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

		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AideAgentStreamingState, {
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
		}
	}

	private updateLabel(state: StreamingState['state'], message?: StreamingState['message']) {
		if (message) {
			this.textLabelElement.textContent = message;
			return;
		}

		let label = localize('aideAgent.streamingState.generalLoading', "Loading");
		switch (state) {
			case ChatStreamingState.WaitingFeedback:
				label = localize('aideAgent.streamingState.waitingFeedback', "Accept changes?");
			case ChatStreamingState.Reasoning:
				label = localize('aideAgent.streamingState.thinking', "Thinking");
				break;
			case ChatStreamingState.ExploringCodebase:
				label = localize('aideAgent.streamingState.exploring', "Exploring codebase");
				break;
			case ChatStreamingState.Generating:
				label = localize('aideAgent.streamingState.generating', "Generating");
				break;
			default:
				break;
		}
		this.textLabelElement.textContent = label;
	}

	update(newState: StreamingState, quiet = false) {
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

		if (newState.isError || newState.state === ChatStreamingState.WaitingFeedback) {
			this.textLabelElement.classList.remove('aide-streaming-state-label-ellipsis');
		} else {
			this.textLabelElement.classList.add('aide-streaming-state-label-ellipsis');
		}
		this.updateLabel(newState.state);
	}

	show() {
		this._isVisible = true;
		this.rootElement.classList.remove('aide-streaming-state-hidden');
		this.rootElement.ariaHidden = 'false';
	}

	hide() {
		if (!this._isVisible) {
			return;
		}
		this.rootElement.ariaHidden = 'true';
		this.rootElement.classList.add('aide-streaming-state-hidden');
		this._register(dom.addDisposableListener(this.rootElement, dom.EventType.ANIMATION_END, async (e: AnimationEvent) => {
			this._isVisible = false;
		}));
	}
}
