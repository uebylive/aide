/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';

export enum CSAgentInitState {
	Uninitialized,
	Initializing,
	Initialized
}

export interface ICSAgentModel {
	readonly onDidDispose: Event<void>;
	readonly sessionId: string;
	readonly initState: CSAgentInitState;
}

export class CSAgentModel extends Disposable implements ICSAgentModel {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private _initState: CSAgentInitState = CSAgentInitState.Uninitialized;

	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get initState(): CSAgentInitState {
		return this._initState;
	}

	constructor() {
		super();

		this._sessionId = generateUuid();
	}

	startInitialize(): void {
		if (this.initState !== CSAgentInitState.Uninitialized) {
			throw new Error(`CSAgentModel is in the wrong state for startInitialize: ${CSAgentInitState[this.initState]}`);
		}
		this._initState = CSAgentInitState.Initializing;
	}

	initialize(): void {
		if (this.initState !== CSAgentInitState.Initializing) {
			throw new Error(`CSAgentModel is in the wrong state for initialize: ${CSAgentInitState[this.initState]}`);
		}

		this._initState = CSAgentInitState.Initialized;
	}
}
