/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';

export interface IAgentTriggerModel {
	readonly kind: 'trigger';
	readonly id: string;
	readonly message: string;
}

export interface IAgentResponseModel {
	readonly kind: 'response';
	readonly id: string;
	readonly message: string;
}

export interface IAgentExchangeModel {
	readonly id: string;
	readonly session: IAideAgentModel;
	readonly exchange: IAgentTriggerModel | IAgentResponseModel;
}

export interface IAideAgentModel {
	readonly sessionId: string;
	getExchanges(): IAgentExchangeModel[];
}

export class AideAgentModel extends Disposable implements IAideAgentModel {
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	private _exchanges: IAgentExchangeModel[];
	getExchanges(): IAgentExchangeModel[] {
		return this._exchanges;
	}

	constructor() {
		super();

		this._sessionId = generateUuid();
		this._exchanges = [];
	}
}
