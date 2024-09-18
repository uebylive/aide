/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAgentResponseProgress } from './aideAgentService.js';

export enum AideAgentScope {
	Selection = 'Selection',
	PinnedContext = 'PinnedContext',
	WholeCodebase = 'WholeCodebase',
}

export interface IAgentTriggerPayload {
	readonly id: string;
	readonly message: string;
	readonly scope: AideAgentScope;
}

export interface IAgentContentModel {
	readonly kind: 'content';
	readonly exchangeId: string;
	readonly message: string | IMarkdownString;
}

export class AgentContentModel implements IAgentContentModel {
	declare kind: 'content';
	readonly exchangeId: string;

	constructor(
		public readonly message: string | IMarkdownString
	) {
		this.exchangeId = generateUuid();
	}
}

export interface IAgentActionModel {
	readonly kind: 'action';
	readonly exchangeId: string;
}

export class AgentActionModel implements IAgentActionModel {
	declare kind: 'action';
	readonly exchangeId: string;

	constructor() {
		this.exchangeId = generateUuid();
	}
}

export type IAgentExchangeData = IAgentContentModel | IAgentActionModel;

export interface IAgentExchangeBlock {
	readonly exchanges: IAgentExchangeData[];
	next?: IAgentExchangeBlock;
}

class AgentExchangeSequence {
	private _first: IAgentExchangeBlock;

	constructor() {
		this._first = { exchanges: [] };
	}

	addTrigger(exchange: IAgentExchangeData): void {
		let current = this._first;
		while (current.next) {
			current = current.next;
		}

		current.next = { exchanges: [exchange] };
	}

	addExchange(parentId: string, exchange: IAgentExchangeData): void {
		let current = this._first;
		while (current) {
			if (current.exchanges.some(ex => ex.exchangeId === parentId)) {
				const newBlock: IAgentExchangeBlock = { exchanges: [exchange] };
				newBlock.next = current.next;
			}

			if (!current.next) {
				current.next = { exchanges: [] };
			}

			current = current.next;
		}
	}

	[Symbol.iterator](): Iterator<IAgentExchangeBlock> {
		let current: IAgentExchangeBlock | undefined = this._first;
		return {
			next(): IteratorResult<IAgentExchangeBlock> {
				if (!current) {
					return { done: true, value: undefined };
				}

				const value = current;
				current = current.next;
				return { done: false, value };
			}
		};
	}
}

export interface IAideAgentModel {
	readonly sessionId: string;
	getExchanges(): Array<IAgentExchangeBlock>;
}

export class AideAgentModel extends Disposable implements IAideAgentModel {
	private readonly _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	private readonly _exchanges: AgentExchangeSequence;
	getExchanges(): Array<IAgentExchangeBlock> {
		return Array.from(this._exchanges);
	}

	constructor() {
		super();

		this._sessionId = generateUuid();
		this._exchanges = new AgentExchangeSequence();
	}

	addTrigger(message: string): IAgentExchangeData {
		const trigger = new AgentContentModel(message);
		this._exchanges.addTrigger(trigger);
		return trigger;
	}

	async acceptProgress(trigger: IAgentExchangeData, progress: IAgentResponseProgress): Promise<void> {
		if (progress.kind === 'markdownContent') {
			const content = new AgentContentModel(progress.content);
			this._exchanges.addExchange(trigger.exchangeId, content);
		} else if (progress.kind === 'textEdit') {
			const action = new AgentActionModel();
			this._exchanges.addExchange(trigger.exchangeId, action);
		}
	}
}
