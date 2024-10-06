/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IChatPlanStep } from '../../common/aideAgentService.js';
import { IChatContentPart } from './aideAgentContentParts.js';

const $ = dom.$;


export class ChatPlanStepPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	constructor(
		readonly step: IChatPlanStep,
		readonly descriptionPart: IChatContentPart,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.domNode = $('.chat-plan-step');
		const number = $('.chat-plan-step-number');
		number.textContent = (step.index + 1).toString();
		this.domNode.appendChild(number);
		this.domNode.appendChild(descriptionPart.domNode);
	}
	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'planStep' && other.description === this.step.description;
	}
}
