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

		const checkPointFlag = this._register(this.instantiationService.createInstance(CheckpointFlag, false, localize('agent.rollbackComplete', "Rollback complete")));
		domNode.appendChild(checkPointFlag.domNode);

		const rollbackInfo = domNode.appendChild($('.aide-collapsed-exchanges-info'));
		const rollbackLabel = rollbackInfo.appendChild($('.aide-rollback-label'));
		rollbackLabel.textContent = rollback.exchangesRemoved.length === 1 ? localize('agent.singleRollback', "Rolled back {0} exchange", 1) : localize('agent.rollbacks', "Rolled back {0} exchanges", rollback.exchangesRemoved.length);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'rollbackCompleted'
			&& other.exchangesRemoved.length === other.exchangesRemoved.length;
	}
}
