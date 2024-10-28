/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Heroicon } from '../../../../browser/heroicon.js';
import './media/aideAgentCheckpointFlag.css';

const $ = dom.$;

export class CheckpointFlag extends Disposable {

	public readonly domNode: HTMLElement;

	constructor(
		isButton: boolean,
		text: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const checkPointButton = this.domNode = $(`${isButton ? 'a' : 'div'}.aide-checkpoint-flag`);
		this._register(dom.addDisposableListener(checkPointButton, dom.EventType.CLICK, async (e: MouseEvent) => {
			console.log('revert to checkpoint');
		}));

		this._register(this.instantiationService.createInstance(Heroicon, checkPointButton, 'micro/flag', { 'class': 'aide-checkpoint-flag-flag-icon' }));

		const checkpointLabel = checkPointButton.appendChild($('.aide-checkpoint-flag-label'));
		checkpointLabel.textContent = text || localize('agent.checkpoint', "Checkpoint before edits"); // TODO(g-danna) Include more information about the checkpoint

		if (isButton) {
			checkPointButton.appendChild($('.aide-checkpoint-flag-discard-icon.codicon.codicon-discard'));
		}
	}
}
