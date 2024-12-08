/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISidecarService = createDecorator<ISidecarService>('ISidecarService');
export interface ISidecarService {
	_serviceBrand: undefined;
	onDidChangeStatus: Event<SidecarStatusUpdateEvent>;

	runningStatus: SidecarRunningStatus;
	downloadStatus: SidecarDownloadStatus;
}

export enum SidecarRunningStatus {
	Unavailable = 'Unavailable',
	Starting = 'Starting',
	Restarting = 'Restarting',
	Connected = 'Connected',
}

export type SidecarDownloadStatus = {
	downloading: boolean;
	update: boolean;
};

export type SidecarStatusUpdateEvent = {
	runningStatus: SidecarRunningStatus;
	downloadStatus: SidecarDownloadStatus;
};

export class SidecarService extends Disposable implements ISidecarService {
	declare _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<SidecarStatusUpdateEvent>());
	public readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private _runningStatus: SidecarRunningStatus;
	get runningStatus(): SidecarRunningStatus {
		return this._runningStatus;
	}

	set runningStatus(status: SidecarRunningStatus) {
		this._runningStatus = status;
		this._onDidChangeStatus.fire({ runningStatus: status, downloadStatus: this._downloadStatus });
	}

	private _downloadStatus: SidecarDownloadStatus;
	get downloadStatus(): SidecarDownloadStatus {
		return this._downloadStatus;
	}

	set downloadStatus(status: SidecarDownloadStatus) {
		this._downloadStatus = status;
		this._onDidChangeStatus.fire({ runningStatus: this._runningStatus, downloadStatus: status });
	}

	constructor() {
		super();

		this._runningStatus = SidecarRunningStatus.Unavailable;
		this._downloadStatus = { downloading: false, update: false };
	}
}
