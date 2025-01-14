/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ExtHostDevtoolsShape, IMainContext, MainContext, MainThreadDevtoolsShape } from './extHost.protocol.js';
import { DevtoolsState } from './extHostTypeConverters.js';
import { Emitter } from '../../../base/common/event.js';
import * as extHostTypes from './extHostTypes.js';
import * as typeConvert from './extHostTypeConverters.js';

export class ExtHostDevtools implements ExtHostDevtoolsShape {
	private _proxy: MainThreadDevtoolsShape;

	private _onDidTriggerInspectingHostStart = new Emitter<void>();
	onDidTriggerInspectingHostStart = this._onDidTriggerInspectingHostStart.event;

	private _onDidTriggerInspectingHostStop = new Emitter<void>();
	onDidTriggerInspectingHostStop = this._onDidTriggerInspectingHostStop.event;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDevtools);
	}

	setStatus(status: vscode.DevtoolsStatus): void {
		const state = DevtoolsState.from(status);
		this._proxy.$setStatus(state);
	}

	setIsInspecting(isInspecting: boolean): void {
		this._proxy.$setIsInspecting(isInspecting);
	}

	setLatestPayload(payload: vscode.Location | null) {
		if (payload) {
			const range = new extHostTypes.Range(payload.range.start, payload.range.end);
			const location = new extHostTypes.Location(payload.uri, range);
			const dto = typeConvert.Location.from(location);
			this._proxy.$setLatestPayload(dto);
		} else {
			this._proxy.$setLatestPayload(null);
		}

	}

	$startInspectingHost(): void {
		this._onDidTriggerInspectingHostStart.fire();
	}

	$stopInspectingHost(): void {
		this._onDidTriggerInspectingHostStop.fire();
	}
}
