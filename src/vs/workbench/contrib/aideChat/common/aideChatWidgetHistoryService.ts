/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';

export interface IAideChatHistoryEntry {
	text: string;
	state?: any;
}

export const IAideChatWidgetHistoryService = createDecorator<IAideChatWidgetHistoryService>('IAideChatWidgetHistoryService');
export interface IAideChatWidgetHistoryService {
	_serviceBrand: undefined;

	readonly onDidClearHistory: Event<void>;

	clearHistory(): void;
	getHistory(): IAideChatHistoryEntry[];
	saveHistory(history: IAideChatHistoryEntry[]): void;
}

interface IAideChatHistory {
	history: IAideChatHistoryEntry[];
}

export class AideChatWidgetHistoryService implements IAideChatWidgetHistoryService {
	_serviceBrand: undefined;

	private memento: Memento;
	private viewState: IAideChatHistory;

	private readonly _onDidClearHistory = new Emitter<void>();
	readonly onDidClearHistory: Event<void> = this._onDidClearHistory.event;

	constructor(
		@IStorageService storageService: IStorageService
	) {
		this.memento = new Memento('aide-chat', storageService);
		const loadedState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IAideChatHistory;
		loadedState.history = loadedState.history.map(entry => typeof entry === 'string' ? { text: entry } : entry);

		this.viewState = loadedState;
	}

	getHistory(): IAideChatHistoryEntry[] {
		return this.viewState.history || [];
	}

	saveHistory(history: IAideChatHistoryEntry[]): void {
		if (!this.viewState.history) {
			this.viewState.history = [];
		}

		this.viewState.history = history;
		this.memento.saveMemento();
	}

	clearHistory(): void {
		this.viewState.history = [];
		this.memento.saveMemento();
		this._onDidClearHistory.fire();
	}
}
