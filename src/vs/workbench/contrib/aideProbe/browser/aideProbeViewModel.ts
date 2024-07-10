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
import { IAideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { IAideProbeTextEdit, IAideProbeBreakdownContent, IAideProbeGoToDefinition, IAideProbeTextEditPreview } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';

export interface IAideProbeViewModel {
	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly requestInProgress: boolean;
	readonly isTailing: boolean;
	readonly onDidChange: Event<void>;
	readonly onChangeActiveBreakdown: Event<IAideProbeBreakdownViewModel>;
}

export class AideProbeViewModel extends Disposable implements IAideProbeViewModel {


	private _filter: string | undefined;

	setFilter(value: string | undefined) {
		this._filter = value;
		this._onDidChange.fire();
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

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

	get isTailing(): boolean {
		return this._model.isTailing;
	}

	private _breakdowns: IAideProbeBreakdownViewModel[] = [];
	get breakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this._breakdowns.filter(b => !this._filter || b.name.toLowerCase().includes(this._filter.toLowerCase()) || b.uri.path.toLowerCase().includes(this._filter.toLowerCase()));
	}

	private _goToDefinitions: IAideProbeGoToDefinitionViewModel[] = [];
	get goToDefinitions(): ReadonlyArray<IAideProbeGoToDefinitionViewModel> {
		return this._goToDefinitions;
	}

	private _codeEditsPreview: IAideProbeTextEditPreview[] = [];
	get codeEditsPreview(): ReadonlyArray<IAideProbeTextEditPreview> {
		return this._codeEditsPreview;
	}


	private _codeEdits: IAideProbeTextEdit[] = [];
	get codeEdits(): ReadonlyArray<IAideProbeTextEdit> {
		return this._codeEdits;
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

			this._goToDefinitions = _model.response?.goToDefinitions.map(definition => {
				return this._register(this.instantiationService.createInstance(AideProbeGoToDefinitionViewModel, definition));
			}) ?? [];

			this._codeEditsPreview = _model.response?.codeEditsPreview.map(preview => {
				return this._register(this.instantiationService.createInstance(AideProbeTextEditPreviewViewModel, preview));
			}) ?? [];

			this._codeEdits = _model.response?.codeEdits.map(edit => {
				return this._register(this.instantiationService.createInstance(AideProbeTextEditViewModel, edit));
			}) ?? [];

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
	readonly query?: IMarkdownString;
	readonly reason?: IMarkdownString;
	readonly response?: IMarkdownString;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	currentRenderedHeight: number | undefined;
}

export interface IAideProbeGoToDefinitionViewModel {
	// symbol uri
	readonly uri: URI;
	// symbol name
	readonly name: string;
	// decoration range on the uri
	readonly range: Range;
	// the thinking process behind following this definition
	readonly thinking: string;
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

	get thinking() {
		return this._definition.thinking;
	}

	constructor(
		private readonly _definition: IAideProbeGoToDefinition,
	) {
		super();
	}
}

export class AideProbeTextEditPreviewViewModel extends Disposable implements IAideProbeTextEditPreview {
	readonly kind = 'textEditPreview';

	get reference() {
		return this._preview.reference;
	}

	get ranges() {
		return this._preview.ranges;
	}

	constructor(
		private readonly _preview: IAideProbeTextEditPreview,
	) {
		super();
	}
}


export class AideProbeTextEditViewModel extends Disposable implements IAideProbeTextEdit {
	readonly kind = 'textEdit';

	get reference() {
		return this._edit.reference;
	}

	get edits() {
		return this._edit.edits;
	}

	constructor(
		private readonly _edit: IAideProbeTextEdit,
	) {
		super();
	}
}
