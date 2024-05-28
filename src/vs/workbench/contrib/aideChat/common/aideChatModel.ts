/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault } from 'vs/base/common/arrays';
import { DeferredPromise } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { ILogService } from 'vs/platform/log/common/log';

export interface IAideChatRequestModel {
	readonly id: string;
	readonly session: IAideChatModel;
	readonly message: string;
	readonly response?: IAideChatResponseModel;
}

export interface IAideChatResponseModel {
	readonly id: string;
	readonly requestId: string;
	readonly session: IAideChatModel;
}

export class AideChatRequestModel implements IAideChatRequestModel {
	private static nextId = 0;

	public response: AideChatResponseModel | undefined;

	public get session() {
		return this._session;
	}

	public readonly id: string;

	constructor(
		private _session: AideChatModel,
		public readonly message: string,
	) {
		this.id = 'request_' + AideChatRequestModel.nextId++;
	}
}

export class AideChatResponseModel extends Disposable implements IAideChatResponseModel {
	private static nextId = 0;

	public readonly id: string;

	public get session() {
		return this._session;
	}

	constructor(
		private _session: AideChatModel,
		public readonly requestId: string,
	) {
		super();

		this.id = 'response_' + AideChatResponseModel.nextId++;
	}
}

export interface IAideChatModel {
	readonly sessionId: string;
	readonly initState: AideChatModelInitState;
	readonly title: string;
}

export interface ISerializableAideChatRequestData {
	message: string;
	isCanceled: boolean | undefined;
}

export interface IExportableAideChatData {
	requests: ISerializableAideChatRequestData[];
}

export interface ISerializableAideChatData extends IExportableAideChatData {
	sessionId: string;
	creationDate: number;
}

export function isExportableSessionData(obj: unknown): obj is IExportableAideChatData {
	const data = obj as IExportableAideChatData;
	return typeof data === 'object' &&
		Array.isArray(data.requests) &&
		data.requests.every((request: ISerializableAideChatRequestData) =>
			typeof request.message === 'string'
		);
}

export function isSerializableSessionData(obj: unknown): obj is ISerializableAideChatData {
	const data = obj as ISerializableAideChatData;
	return isExportableSessionData(obj) &&
		typeof data.creationDate === 'number' &&
		typeof data.sessionId === 'string';
}

export enum AideChatModelInitState {
	Created,
	Initializing,
	Initialized
}

export class AideChatModel extends Disposable implements IAideChatModel {
	static getDefaultTitle(requests: (ISerializableAideChatRequestData | IAideChatRequestModel)[]): string {
		const firstRequestMessage = firstOrDefault(requests)?.message ?? '';
		const message = firstRequestMessage;
		return message.split('\n')[0].substring(0, 50);
	}

	protected _requests: AideChatRequestModel[];
	private _initState: AideChatModelInitState = AideChatModelInitState.Created;
	private _isInitializedDeferred = new DeferredPromise<void>();

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get initState(): AideChatModelInitState {
		return this._initState;
	}

	get title(): string {
		return AideChatModel.getDefaultTitle(this._requests);
	}

	constructor(
		initialData: ISerializableAideChatData | IExportableAideChatData | undefined,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._sessionId = (isSerializableSessionData(initialData) && initialData.sessionId) || generateUuid();
		this._requests = initialData ? this._deserialize(initialData) : [];
	}

	private _deserialize(obj: IExportableAideChatData): AideChatRequestModel[] {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
			return [];
		}

		try {
			return requests.map(requestData => {
				const request = new AideChatRequestModel(this, requestData.message);
				return request;
			});
		} catch (error) {
			this.logService.error('Failed to parse chat data', error);
			return [];
		}
	}

	startInitialize(): void {
		if (this.initState !== AideChatModelInitState.Created) {
			throw new Error(`AideChatModel is in the wrong state for startInitialize: ${AideChatModelInitState[this.initState]}`);
		}
		this._initState = AideChatModelInitState.Initializing;
	}

	deinitialize(): void {
		this._initState = AideChatModelInitState.Created;
		this._isInitializedDeferred = new DeferredPromise<void>();
	}

	initialize(): void {
		if (this.initState !== AideChatModelInitState.Initializing) {
			throw new Error(`AideChatModel is in the wrong state for initialize: ${AideChatModelInitState[this.initState]}`);
		}

		this._initState = AideChatModelInitState.Initialized;

		this._isInitializedDeferred.complete();
	}

	setInitializationError(error: Error): void {
		if (this.initState !== AideChatModelInitState.Initializing) {
			throw new Error(`AideChatModel is in the wrong state for setInitializationError: ${AideChatModelInitState[this.initState]}`);
		}

		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(error);
		}
	}

	waitForInitialization(): Promise<void> {
		return this._isInitializedDeferred.p;
	}
}
