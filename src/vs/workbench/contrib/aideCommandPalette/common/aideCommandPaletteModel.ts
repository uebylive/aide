/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';

export interface IAideCommandPaletteRequestModel {
	readonly sessionId: string;
	readonly message: string;
}

export interface IAideCommandPaletteResponseModel {
	result?: string;
}

export interface IAideCommandPaletteModel {
	onDidChange: Event<void>;

	sessionId: string;
	request: IAideCommandPaletteRequestModel | undefined;
	response: IAideCommandPaletteResponseModel | undefined;

	isComplete: boolean;
	requestInProgress: boolean;
}

export class AideCommandPaletteRequestModel extends Disposable implements IAideCommandPaletteRequestModel {
	constructor(
		readonly sessionId: string,
		readonly message: string,
	) {
		super();
	}
}

export class AideCommandPaletteResponseModel extends Disposable implements IAideCommandPaletteResponseModel {
	private _result: string | undefined;
	get result(): string | undefined {
		return this._result;
	}

	set result(value: string) {
		this._result = value;
	}

	constructor() {
		super();
	}
}

export class AideCommandPaletteModel extends Disposable implements IAideCommandPaletteModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _request: AideCommandPaletteRequestModel | undefined;
	private _response: AideCommandPaletteResponseModel | undefined;
	private _isComplete = false;

	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get request(): IAideCommandPaletteRequestModel | undefined {
		return this._request;
	}

	get requestInProgress(): boolean {
		return !!this._request && !this._isComplete;
	}

	set request(value: AideCommandPaletteRequestModel) {
		this._request = value;
	}

	get response(): AideCommandPaletteResponseModel | undefined {
		return this._response;
	}

	get isComplete(): boolean {
		return this._isComplete;
	}

	constructor() {
		super();
		this._sessionId = generateUuid();
	}

	completeResponse(): void {
		this._isComplete = true;
		this._onDidChange.fire();
	}

	cancelRequest(): void {
		this._request = undefined;
		this._response = undefined;
		this._isComplete = false;
		this._onDidChange.fire();
	}
}
