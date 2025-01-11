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

	private _onInspectHostChange = new vscode.EventEmitter<boolean>();
	onInspectHostChange = this._onInspectHostChange.event;

	private _status: DevtoolsStatus = DevtoolsStatus.Idle;
	get status() {
		return this._status;
	}

	private _insepectedElement: InspectedElementPayload | null = null;
	get inspectedElement() {
		return this._insepectedElement;
	}

	private _proxyListenPort: number | undefined;

	get proxyListenPort() {
		return this._proxyListenPort;
	}

	private _cleanupProxy: (() => void) | undefined;
	private _Devtools: Devtools;

	constructor() {
		this._Devtools = Devtools
			.setStatusListener(this.updateStatus.bind(this))
			.setDataCallback(this.updateInspectedElement.bind(this))
			.setDisconnectedCallback(this.onDidDisconnect.bind(this))
			.setInspectionCallback(this.updateInspectHost.bind(this))
			.startServer(8097, 'localhost');
	}

	private updateStatus(_message: string, status: DevtoolsStatus) {
		this._status = status;
		this._onStatusChange.fire(status);
	}

	private updateInspectHost(isInspecting: boolean) {
		this._onInspectHostChange.fire(isInspecting);
	}

	private onDidDisconnect() {
		this._cleanupProxy?.();
		this._cleanupProxy = undefined;
		this._proxyListenPort = undefined;
		if (this._status === DevtoolsStatus.DevtoolsConnected) {
			// @g-danna take a look at this again
			this.updateStatus('Devtools disconnected', DevtoolsStatus.ServerConnected);
		}
	}

	private updateInspectedElement(payload: InspectedElementPayload) {
		this._insepectedElement = payload;
		if (payload.type !== 'no-change') {
			this._onInspectedElementChange.fire(payload);
		}
	}

	async proxy(port: number) {
		if (this._proxyListenPort) {
			return this._proxyListenPort;
		}
		if (this.status !== 'server-connected') {
			throw new Error('Devtools server is not connected, cannot initialize proxy');
		}
		const { listenPort, cleanup } = await proxy(port, this._Devtools.currentPort);
		this._proxyListenPort = listenPort;
		this._cleanupProxy = cleanup;
		return this._proxyListenPort;
	}

	startInspectingHost() {
		// Have to call this manually because React devtools don't call this
		this._onInspectHostChange.fire(true);
		this._Devtools.startInspectingHost();
	}

	stopInspectingHost() {
		this._Devtools.stopInspectingHost();
	}
}
