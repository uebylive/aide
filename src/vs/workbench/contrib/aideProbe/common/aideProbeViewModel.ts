/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { IAideProbeBreakdownContent, IAideProbeGoToDefinition } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';

export interface IAideProbeViewModel {
	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly requestInProgress: boolean;
	readonly isTailing: boolean;
	readonly onDidChange: Event<void>;
	readonly onChangeActiveBreakdown: Event<IAideProbeBreakdownViewModel>;
	// TODO(willis): Maybe this is wrong, but lets push through with this type
	readonly onChangeGoToDefinition: Event<IAideProbeGoToDefinitionViewModel[]>;
}

export class AideProbeViewModel extends Disposable implements IAideProbeViewModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onChangeActiveBreakdown = this._register(new Emitter<IAideProbeBreakdownViewModel>());
	readonly onChangeActiveBreakdown = this._onChangeActiveBreakdown.event;

	private readonly _onChangeGoToDefinition = this._register(new Emitter<IAideProbeGoToDefinitionViewModel[]>());
	readonly onChangeGoToDefinition = this._onChangeGoToDefinition.event;

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

	private _breakdowns: IAideProbeBreakdownViewModel[] = [];
	private _goToDefinitions: IAideProbeGoToDefinitionViewModel[] = [];
	get breakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this._breakdowns;
	}
	get goToDefinitions(): ReadonlyArray<IAideProbeGoToDefinitionViewModel> {
		return this._goToDefinitions;
	}

	constructor(
		private readonly _model: IAideProbeModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(_model.onDidChange(() => {
			this._breakdowns = _model.response?.breakdowns.map((item) => {
				const viewItem = this._register(this.instantiationService.createInstance(AideProbeBreakdownViewModel, item));
				return viewItem;
			}) ?? [];

			if (_model.response) {
				// TODO(willis+skcd): Not sure if this is really correct.. but yolo
				this._goToDefinitions = [];
				// this._goToDefinitions = _model.response.goToDefinitions.values();
				for (const response of _model.response.goToDefinitions.values()) {
					for (const definition of response) {
						const viewItem = this._register(this.instantiationService.createInstance(AideProbeGoToDefinitionViewModel, definition));
						this._goToDefinitions.push(viewItem);
					}
				}
				this._onChangeGoToDefinition.fire(this._goToDefinitions);
			}

			if (_model.response && this.isTailing && this._breakdowns.length > 0) {
				const latestBreakdown = this._breakdowns[this._breakdowns.length - 1];
				this._onChangeActiveBreakdown.fire(latestBreakdown);
			}

			this._onDidChange.fire();
		}));
		this._register(_model.onDidChangeTailing((isTailing) => {
			if (isTailing && this._breakdowns.length > 0) {
				const latestBreakdown = this._breakdowns[this._breakdowns.length - 1];
				this._onChangeActiveBreakdown.fire(latestBreakdown);
			}
		}));
	}
}

export interface IAideProbeBreakdownViewModel {
	readonly uri: URI;
	readonly name: string;
	query?: IMarkdownString;
	reason?: IMarkdownString;
	response?: IMarkdownString;
	currentRenderedHeight: number | undefined;
}

export interface IAideProbeGoToDefinitionViewModel {
	// symbol uri
	readonly uri: URI;
	// symbol name
	readonly name: string;
	// decoration range on the uri
	readonly range: Range;
}

export class AideProbeBreakdownViewModel extends Disposable implements IAideProbeBreakdownViewModel {
	get uri() {
		return this._breakdown.reference.uri;
	}

	get name() {
		return this._breakdown.reference.name;
	}

	get query() {
		return this._breakdown.query;
	}

	set query(value: IMarkdownString | undefined) {
		this._breakdown.query = value;
	}

	get reason() {
		return this._breakdown.reason;
	}

	set reason(value: IMarkdownString | undefined) {
		this._breakdown.reason = value;
	}

	get response() {
		return this._breakdown.response;
	}

	set response(value: IMarkdownString | undefined) {
		this._breakdown.response = value;
	}

	currentRenderedHeight: number | undefined;

	constructor(
		private readonly _breakdown: IAideProbeBreakdownContent,
	) {
		super();
	}
}

export class AideProbeGoToDefinitionViewModel extends Disposable implements IAideProbeGoToDefinitionViewModel {

	get uri() {
		return this._definition.uri;
	}

	get name() {
		return this._definition.name;
	}

	get range() {
		return this._definition.range;
	}

	constructor(
		private readonly _definition: IAideProbeGoToDefinition,
	) {
		super();
	}
}
