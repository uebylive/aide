/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IChatRollbackCompleted } from '../../common/aideAgentService.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CheckpointFlag } from './aideAgentCheckpointFlag.js';
import './media/aideAgentCollapsedExchanges.css';

const $ = dom.$;

export class CollapsedExchangesContentPart extends Disposable {
	public readonly domNode: HTMLElement;
	constructor(
		readonly rollback: IChatRollbackCompleted,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {

		super();
		const domNode = this.domNode = $('.aide-collapsed-exchanges-block');

		const checkPointFlag = this._register(this.instantiationService.createInstance(CheckpointFlag, false, undefined));
		domNode.appendChild(checkPointFlag.domNode);

		const rollbackInfo = domNode.appendChild($('.aide-collapsed-exchanges-info'));
		const rollbackLabel = rollbackInfo.appendChild($('.aide-rollback-label'));
		rollbackLabel.textContent = rollback.exchangesRemoved === 1 ? localize('agent.singleRollback', "{0} exchange collapsed", 1) : localize('agent.rollbacks', "{0} exchanges collapsed", rollback.exchangesRemoved);

		const rollbackCompleteElement = domNode.appendChild($('.aide-rollback-complete'));

		rollbackCompleteElement.appendChild($('.aide-checkpoint-flag-flag-icon.codicon.codicon-debug-restart'));
		//this._register(this.instantiationService.createInstance(Heroicon, rollbackCompleteElement, 'micro/arrow-uturn-left', { 'class': 'aide-checkpoint-flag-flag-icon' }));
		const rollbackCompleteLabel = rollbackCompleteElement.appendChild($('.aide-rollback-complete-label'));
		rollbackCompleteLabel.textContent = localize('agent.rollbackComplete', "Rollback complete");
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'rollbackCompleted'
			&& other.exchangesRemoved === other.exchangesRemoved;
	}
}
