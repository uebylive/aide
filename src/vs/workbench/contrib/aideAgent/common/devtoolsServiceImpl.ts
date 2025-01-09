/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { DevtoolsStatus, IDevtoolsService } from './devtoolsService.js';
import { CONTEXT_DEVTOOLS_STATUS, CONTEXT_IS_INSPECTING_HOST } from './devtoolsServiceContextKeys.js';

export class DevtoolsService extends Disposable implements IDevtoolsService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<DevtoolsStatus>());
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly _onDidTriggerInspectingHostStart = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStart = this._onDidTriggerInspectingHostStart.event;

	private readonly _onDidTriggerInspectingHostStop = this._register(new Emitter<void>());
	public readonly onDidTriggerInspectingHostStop = this._onDidTriggerInspectingHostStop.event;

	private _latestPayload: any;
	get latestPayload(): any {
		return this._latestPayload;
	}

	set latestPayload(payload: any) {
		this._latestPayload = payload;
	}

	private _status: IContextKey<DevtoolsStatus>;
	get status(): DevtoolsStatus {
		const contextKeyValue = this._status.get();
		if (contextKeyValue === undefined) {
			console.error(`Context key for ${CONTEXT_DEVTOOLS_STATUS.key} is undefined. Resetting`);
			this._status.reset();
		}
		return this._status.get()!;
	}

	set status(status: DevtoolsStatus) {
		this._status.set(status);
		this.notifyStatusChange();
	}

	private _isInspecting: IContextKey<boolean>;
	get isInspecting() {
		const contextKeyValue = this._isInspecting.get();
		if (contextKeyValue === undefined) {
			console.error(`Context key for ${CONTEXT_IS_INSPECTING_HOST.key} in is undefined. Resetting`);
			this._isInspecting.reset();
		}
		return this._isInspecting.get()!;
	}

	set isInspecting(isInspecting: boolean) {
		this._isInspecting.set(isInspecting);
	}

	private notifyStatusChange() {
		console.log('Devtools service status: ', this.status);
		this._onDidChangeStatus.fire(this.status);
	}

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		super();
		this._status = CONTEXT_DEVTOOLS_STATUS.bindTo(contextKeyService);
		this._isInspecting = CONTEXT_IS_INSPECTING_HOST.bindTo(contextKeyService);
	}

	startInspectingHost(): void {
		this._isInspecting.set(true);
		this._onDidTriggerInspectingHostStart.fire();
	}

	stopInspectingHost(): void {
		this._isInspecting.set(false);
		this._onDidTriggerInspectingHostStop.fire();
	}
}
