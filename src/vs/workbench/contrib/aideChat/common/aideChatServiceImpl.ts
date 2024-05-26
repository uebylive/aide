/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { AideChatModel, IAideChatModel, IExportableAideChatData, ISerializableAideChatData } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';

export class AideChatService extends Disposable implements IAideChatService {
	declare _serviceBrand: undefined;

	private readonly _sessionModels = this._register(new DisposableMap<string, AideChatModel>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	private trace(method: string, message?: string): void {
		if (message) {
			this.logService.trace(`AideChatService#${method}: ${message}`);
		} else {
			this.logService.trace(`AideChatService#${method}`);
		}
	}

	startSession(token: CancellationToken): AideChatModel | undefined {
		this.trace('startSession');
		return this._startSession(undefined, token);
	}

	private _startSession(someSessionHistory: IExportableAideChatData | ISerializableAideChatData | undefined, token: CancellationToken): AideChatModel {
		const model = this.instantiationService.createInstance(AideChatModel, someSessionHistory);
		this._sessionModels.set(model.sessionId, model);
		this.initializeSession(model, token);
		return model;
	}

	private async initializeSession(model: AideChatModel, token: CancellationToken): Promise<void> {
		try {
			this.trace('initializeSession', `Initialize session ${model.sessionId}`);
			model.startInitialize();
			model.initialize();
		} catch (err) {
			this.trace('startSession', `initializeSession failed: ${err}`);
			model.setInitializationError(err);
			this._sessionModels.deleteAndDispose(model.sessionId);
		}
	}

	getOrRestoreSession(sessionId: string): IAideChatModel | undefined {
		throw new Error('Method not implemented.');
	}

	clearSession(sessionId: string): void {
		throw new Error('Method not implemented.');
	}
}
