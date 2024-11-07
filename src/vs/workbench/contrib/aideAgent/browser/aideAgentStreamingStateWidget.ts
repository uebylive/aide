/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatEditsInfo, IChatPlanInfo } from '../common/aideAgentService.js';
import { CONTEXT_STREAMING_STATE } from '../common/aideAgentContextKeys.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { PlanContentPart } from './aideAgentContentParts/aideAgentPlanContentPart.js';
import './media/aideAgentStreamingState.css';
import { EditsContentPart } from './aideAgentContentParts/aideAgentEditsContentPart.js';

const $ = dom.$;

type StreamingState = IChatPlanInfo | IChatEditsInfo;

// If you end up here and are confued about the buttons and where they are coming from
// grep for `MenuId.AideAgentStreamingState` and follow the hits, the registration of commands
// happens using the `MenuId.AideAgentStreamingState` state


export interface StreamingStateToolbarContext {
	aideAgentSessionId: string;
	aideAgentExchangeId: string;
}

export class StreamingStateWidget extends Disposable {

	private rootElement: HTMLElement;
	private _isVisible: boolean;
	_toolbarContext?: StreamingStateToolbarContext;
	get toolbarContext() {
		return this._toolbarContext;
	}

	constructor(
		streamingState: StreamingState | undefined,
		container: HTMLElement,
		initialIsVisible = false,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this._isVisible = initialIsVisible;
		this.rootElement = dom.append(container, $('.aide-streaming-state'));


		CONTEXT_STREAMING_STATE.bindTo(this.contextKeyService);


		if (streamingState) {
			this.update(streamingState, true);
		}
		if (this._isVisible) {
			this.show();
		} else {
			this.hide();
		}
	}

	update(newState: StreamingState, quiet = false) {
		dom.clearNode(this.rootElement);

		if (!quiet && !this._isVisible) {
			this.show();
		}

		if (newState.kind === 'planInfo') {
			const plan = newState;
			const planContentPart = this.instantiationService.createInstance(PlanContentPart, plan, newState.description?.value);
			if (planContentPart._toolbar) {
				const context = {
					aideAgentSessionId: newState.sessionId,
					aideAgentExchangeId: newState.exchangeId,
				};
				this._toolbarContext = context;
				planContentPart._toolbar.context = context;
			}
			this.rootElement.appendChild(planContentPart.domNode);
		} else if (newState.kind === 'editsInfo') {
			const edits = newState;
			const planContentPart = this.instantiationService.createInstance(EditsContentPart, edits, newState.description?.value);
			if (planContentPart._toolbar) {
				const context = {
					aideAgentSessionId: newState.sessionId,
					aideAgentExchangeId: newState.exchangeId,
				};
				this._toolbarContext = context;
				planContentPart._toolbar.context = context;
			}
			this.rootElement.appendChild(planContentPart.domNode);
		}
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
