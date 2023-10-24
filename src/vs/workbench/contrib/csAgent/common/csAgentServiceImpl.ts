/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CSAgentModel } from 'vs/workbench/contrib/csAgent/common/csAgentModel';
import { ICSAgentService } from 'vs/workbench/contrib/csAgent/common/csAgentService';

export class CSAgentService extends Disposable implements ICSAgentService {
	_serviceBrand: undefined;

	private readonly _sessionModels = new Map<string, CSAgentModel>();

	private readonly _onDidDisposeSession = this._register(new Emitter<{ sessionId: string }>());
	public readonly onDidDisposeSession = this._onDidDisposeSession.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	startSession(token: CancellationToken): CSAgentModel {
		return this._startSession(token);
	}

	private _startSession(token: CancellationToken): CSAgentModel {
		const model = this.instantiationService.createInstance(CSAgentModel);
		this._sessionModels.set(model.sessionId, model);
		this.initializeSession(model, token);
		return model;
	}

	private initializeSession(model: CSAgentModel, token: CancellationToken): void {
		try {
			model.startInitialize();
			model.initialize();
		} catch (err) {
			model.dispose();
			this._sessionModels.delete(model.sessionId);
			this._onDidDisposeSession.fire({ sessionId: model.sessionId });
		}
	}

	async sendRequest(sessionId: string, message: string, token: CancellationToken): Promise<void> {
		if (!message.trim()) {
			return;
		}

		const model = this._sessionModels.get(sessionId);
		if (!model) {
			throw new Error(`No session found for id: ${sessionId}`);
		}

		const asyncRequest = this._sendRequestAsync(model, sessionId, message, token);
		return asyncRequest;
	}

	private async _sendRequestAsync(model: CSAgentModel, sessionId: string, message: string, token: CancellationToken): Promise<void> {
		// no-op
	}
}
