/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';

export interface IArcModel {
	readonly sessionId: string;
	readonly providerId: string;
}

export class ArcModel extends Disposable implements IArcModel {
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	constructor(
		public readonly providerId: string,
	) {
		super();

		this._sessionId = generateUuid();
	}
}
