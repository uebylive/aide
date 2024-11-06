/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatRendererContent } from '../../common/aideAgentViewModel.js';
import { ChatTreeItem } from '../aideAgent.js';
import { IChatContentPart } from './aideAgentContentParts.js';
import './media/aideAgentCheckpointFlag.css';

const $ = dom.$;

export class CheckpointFlag extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	constructor(
		isButton: boolean,
		text: string | undefined,
		//@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const checkPointButton = this.domNode = $(`${isButton ? 'a' : 'div'}.aide-checkpoint-flag`);

		//this._register(this.instantiationService.createInstance(Heroicon, checkPointButton, 'micro/flag', { 'class': 'aide-checkpoint-flag-flag-icon' }));
		checkPointButton.appendChild($('.aide-checkpoint-flag-flag-icon.codicon.codicon-go-to-file'));

		const checkpointLabel = checkPointButton.appendChild($('.aide-checkpoint-flag-label'));
		checkpointLabel.textContent = text || localize('agent.checkpoint', "Checkpoint made before edits"); // TODO(g-danna) Include more information about the checkpoint


		const discardIcon = checkPointButton.appendChild($('.aide-checkpoint-flag-discard-icon.codicon.codicon-discard'));
		if (!isButton) {
			discardIcon.style.opacity = '0.8';
		}

	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'checkpointAdded';
	}
}
