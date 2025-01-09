/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// @ts-expect-error external
import Devtools from './dist/standalone.js';
import { proxy } from './proxy';
import { DevtoolsStatus, InspectedElementPayload } from './types';

export class ReactDevtoolsManager {
	private _onStatusChange = new vscode.EventEmitter<DevtoolsStatus>();
	onStatusChange = this._onStatusChange.event;

	private _onInspectedElementChange = new vscode.EventEmitter<InspectedElementPayload>();
	onInspectedElementChange = this._onInspectedElementChange.event;

	private _status: DevtoolsStatus = DevtoolsStatus.Idle;
	get status() {
		return this._status;
	}

	private _insepectedElement: InspectedElementPayload | null = null;
	get inspectedElement() {
		return this._insepectedElement;
	}

	private _Devtools: Devtools;

	constructor() {
		this._Devtools = Devtools
			.setStatusListener(this.updateStatus.bind(this))
			.setDataCallback(this.updateInspectedElement.bind(this))
			.startServer(8097, 'localhost');
	}

	private updateStatus(_message: string, status: DevtoolsStatus) {
		this._status = status;
		this._onStatusChange.fire(status);
	}

	private updateInspectedElement(payload: InspectedElementPayload) {
		this._insepectedElement = payload;
		if (payload.type !== 'no-change') {
			console.log('inspected element', payload);
			this._onInspectedElementChange.fire(payload);
		}
	}

	proxy(port: number, reactDevtoolsPort = 8097) {
		if (this.status !== 'server-connected') {
			throw new Error('Devtools server is not connected, cannot proxy');
		}
		return proxy(port, reactDevtoolsPort);
	}

	startInspectingHost() {
		this._Devtools.startInspectingHost();
	}

	stopInspectingHost() {
		this._Devtools.stopInspectingHost();
	}
}
