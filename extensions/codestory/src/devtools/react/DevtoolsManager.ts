/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// @ts-expect-error external
import Devtools from './dist/standalone.js';
import { proxy } from './proxy';
import { DevtoolsStatus, InspectedElementPayload, InspectElementParsedFullData } from './types';
import { findTsxNodeAtLine } from '../../languages/tsxCodeSymbols.js';
import { join } from 'node:path';

export class ReactDevtoolsManager {
	private _onStatusChange = new vscode.EventEmitter<DevtoolsStatus>();
	onStatusChange = this._onStatusChange.event;

	private _onInspectedElementChange = new vscode.EventEmitter<vscode.Location | null>();
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


	private _disconnectedPromise: DeferredPromise | null = null;
	get disconnectedPromise() {
		return this._disconnectedPromise;
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
		if (status === DevtoolsStatus.ServerConnected) {
			this._disconnectedPromise = new DeferredPromise();
		}
		this._onStatusChange.fire(status);
	}

	private updateInspectHost(isInspecting: boolean) {
		this._onInspectHostChange.fire(isInspecting);
	}

	private onDidDisconnect() {
		if (!this._disconnectedPromise) {
			this._disconnectedPromise = new DeferredPromise();
		}
		this._disconnectedPromise.resolve();
		this._cleanupProxy?.();
		this._cleanupProxy = undefined;
		this._proxyListenPort = undefined;
		if (this._status === DevtoolsStatus.DevtoolsConnected) {
			// @g-danna take a look at this again
			this.updateStatus('Devtools disconnected', DevtoolsStatus.ServerConnected);
		}
	}

	private async updateInspectedElement(payload: InspectedElementPayload) {
		this._insepectedElement = payload;
		if (payload.type === 'full-data') {
			const reference = await this.getValidReference(payload);
			this._onInspectedElementChange.fire(reference);
		}
	}

	private async getValidReference(payload: InspectElementParsedFullData): Promise<vscode.Location | null> {
		try {
			const { parsedSource } = payload.value;
			if (parsedSource) {
				const { source, column, line } = parsedSource;
				let reference: vscode.Uri | null = null;
				if (source.type === 'URL') {
					reference = await this.resolveRelativeReference(source.relativePath);
				} else if (source.type === 'relative') {
					reference = await this.resolveRelativeReference(source.path);
				} else if (source.type === 'absolute') {
					reference = vscode.Uri.parse(source.path);
				}

				if (!reference) {
					console.error(`Cannot find file on system: ${JSON.stringify(payload)}`);
					return null;
				}

				const doc = await vscode.workspace.openTextDocument(reference);

				const fullRange = doc.validateRange(
					new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
				);

				let range = fullRange;

				if (parsedSource.symbolicated) {
					const fileArrayBuffer = await vscode.workspace.fs.readFile(reference);
					const fileString = fileArrayBuffer.toString().replace(/\\n/g, '\n');
					const fullRange = await findTsxNodeAtLine(fileString, line);
					const endLine = fullRange ? fullRange.endLine : line;

					range = new vscode.Range(
						new vscode.Position(line, column),
						new vscode.Position(endLine, 9999999),
					);
				}
				return new vscode.Location(
					reference,
					range
				);
			} else {
				return null;
			}
		} catch (err) {
			return null;
		}
	}

	private async resolveRelativeReference(relativePath: string): Promise<vscode.Uri | null> {
		if (!vscode.workspace.workspaceFolders) {
			throw Error('A workspace needs to be open in order to parse relative references.');
		}
		for (const workspaceFolder of vscode.workspace.workspaceFolders) {
			const absolutePath = join(workspaceFolder.uri.fsPath, relativePath);
			const uri = vscode.Uri.file(absolutePath);
			const doesFileExist = await vscode.workspace.fs.stat(uri);
			if (doesFileExist) {
				return uri;
			}
		}
		return null;
	}



	async proxy(port: number) {
		if (this._proxyListenPort) {
			this.onDidDisconnect();
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


class DeferredPromise {
	promise: Promise<any>;
	resolve!: (...args: any) => void;
	reject!: (reason: any) => void;

	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

