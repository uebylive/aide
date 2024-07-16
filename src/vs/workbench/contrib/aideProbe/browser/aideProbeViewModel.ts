/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { DocumentSymbol } from 'vs/editor/common/languages';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideProbeBreakdownContent, IAideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbe';

export interface IAideProbeViewModel {
	readonly onDidChange: Event<void>;
	readonly onChangeActiveBreakdown: Event<IAideProbeBreakdownViewModel>;

	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly requestInProgress: boolean;
	readonly breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>;
}

export class AideProbeViewModel extends Disposable implements IAideProbeViewModel {
	private _filter: string | undefined;

	setFilter(value: string | undefined) {
		this._filter = value;
		this._onDidFilter.fire();
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidFilter = this._register(new Emitter<void>());
	readonly onDidFilter = this._onDidFilter.event;

	private readonly _onChangeActiveBreakdown = this._register(new Emitter<IAideProbeBreakdownViewModel>());
	readonly onChangeActiveBreakdown = this._onChangeActiveBreakdown.event;

	private _references: Map<string, IReference<IResolvedTextEditorModel>> = new Map();

	get model(): IAideProbeModel {
		return this._model;
	}

	get sessionId(): string {
		return this._model.sessionId;
	}

	get requestInProgress(): boolean {
		return this._model.requestInProgress;
	}

	private _breakdowns: IAideProbeBreakdownViewModel[] = [];
	get breakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this._breakdowns;
	}

	get filteredBreakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this.breakdowns.filter(b => !this._filter || b.name.toLowerCase().includes(this._filter.toLowerCase()) || b.uri.path.toLowerCase().includes(this._filter.toLowerCase()));
	}

	constructor(
		private readonly _model: IAideProbeModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) {
		super();

		this._register(_model.onDidChange(async () => {
			this._breakdowns = await Promise.all(_model.response?.breakdowns.map(async (item) => {
				let reference = this._references.get(item.reference.uri.toString());
				if (!reference) {
					reference = await this.textModelResolverService.createModelReference(item.reference.uri);
				}

				const viewItem = this._register(this.instantiationService.createInstance(AideProbeBreakdownViewModel, item, reference));
				return viewItem;
			}) ?? []);

			this._onDidChange.fire();
		}));
	}
}

export interface IAideProbeBreakdownViewModel {
	readonly uri: URI;
	readonly name: string;
	readonly query?: IMarkdownString;
	readonly reason?: IMarkdownString;
	readonly response?: IMarkdownString;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	currentRenderedHeight: number | undefined;
}

export interface IAideProbeCodeEditPreviewViewModel {
	readonly uri: URI;
	readonly range: Range;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	isRendered: boolean;
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

	get reason() {
		return this._breakdown.reason;
	}

	get response() {
		return this._breakdown.response;
	}

	private _symbolResolver: (() => Promise<DocumentSymbol | undefined>) | undefined;
	private _symbol: DocumentSymbol | undefined;
	get symbol() {
		return this._getSymbol();
	}

	private async _getSymbol(): Promise<DocumentSymbol | undefined> {
		if (!this._symbol && this._symbolResolver) {
			this._symbol = await this._symbolResolver();
		}

		return this._symbol;
	}

	currentRenderedHeight: number | undefined;

	constructor(
		private readonly _breakdown: IAideProbeBreakdownContent,
		private readonly reference: IReference<IResolvedTextEditorModel>,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
	) {
		super();

		if (_breakdown.reference.uri && _breakdown.reference.name) {
			this._symbolResolver = async () => {
				this._symbol = await this.resolveSymbol();
				return this._symbol;
			};
			this._symbolResolver();
		}
	}

	async resolveSymbol(): Promise<DocumentSymbol | undefined> {
		try {
			const symbols = (await this.outlineModelService.getOrCreate(this.reference.object.textEditorModel, CancellationToken.None)).getTopLevelSymbols();
			const symbol = symbols.find(s => s.name === this.name);
			if (!symbol) {
				return;
			}

			return symbol;
		} catch (e) {
			return;
		}
	}
}
