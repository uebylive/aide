/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { IAideProbeBreakdownContent } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';

export interface IAideProbeViewModel {
	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly requestInProgress: boolean;
	readonly isTailing: boolean;
	readonly onDidChange: Event<void>;
	setActiveBreakdown(breakdown: IAideChatBreakdownViewModel | undefined): void;
}

export class AideProbeViewModel extends Disposable implements IAideProbeViewModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _activeBreakdown: IAideChatBreakdownViewModel | undefined;

	get model(): IAideProbeModel {
		return this._model;
	}

	get sessionId(): string {
		return this._model.sessionId;
	}

	get requestInProgress(): boolean {
		return this._model.requestInProgress;
	}

	get isTailing(): boolean {
		return this._model.isTailing;
	}

	// TODO(@ghostwriternr): Do we need this?
	get activeBreakdown(): IAideChatBreakdownViewModel | undefined {
		return this._activeBreakdown;
	}

	constructor(
		private readonly _model: IAideProbeModel,
	) {
		super();

		this._register(_model.onDidChange(() => {
			if (_model.response && this.isTailing) {
				const latestBreakdown = _model.response.breakdowns[_model.response.breakdowns.length - 1];
				if (latestBreakdown) {
					this.setActiveBreakdown(new AideChatBreakdownViewModel(latestBreakdown));
				}
			}
			this._onDidChange.fire();
		}));
	}

	setActiveBreakdown(breakdown: IAideChatBreakdownViewModel | undefined) {
		this._activeBreakdown = breakdown;
	}
}

export interface IAideChatBreakdownViewModel {
	readonly uri: URI;
	readonly name: string;
	readonly query?: IMarkdownString;
	readonly reason?: IMarkdownString;
	readonly response?: IMarkdownString;
	currentRenderedHeight: number | undefined;
}

export class AideChatBreakdownViewModel extends Disposable implements IAideChatBreakdownViewModel {
	get uri() {
		return this._breakdown.reference.uri;
	}

	get name() {
		return this._breakdown.reference.name;
	}

	get query() {
		return this._breakdown.query;
	}

	get reason() {
		return this._breakdown.reason;
	}

	get response() {
		return this._breakdown.response;
	}

	currentRenderedHeight: number | undefined;

	constructor(
		private readonly _breakdown: IAideProbeBreakdownContent,
	) {
		super();
	}
}
