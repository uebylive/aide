/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { IArc } from 'vs/workbench/contrib/arc/common/arcService';

export interface IArcModel {
	readonly sessionId: string;
	readonly providerId: string;
}

export class ArcModel extends Disposable implements IArcModel {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<unknown>());
	readonly onDidChange = this._onDidChange.event;

	private _session: IArc | undefined;
	get session(): IArc | undefined {
		return this._session;
	}

	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	private _providerState: any;
	get providerState(): any {
		return this._providerState;
	}

	constructor(
		public readonly providerId: string,
	) {
		super();

		this._sessionId = generateUuid();
	}

	initialize(session: IArc): void {
		if (this._session) {
			throw new Error('ArcModel is already initialized');
		}

		this._session = session;

		if (session.onDidChangeState) {
			this._register(session.onDidChangeState(state => {
				this._providerState = state;
			}));
		}
		this._onDidChange.fire({ kind: 'initialize' });
	}
}
