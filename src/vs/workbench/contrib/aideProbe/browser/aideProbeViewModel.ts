/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IReference } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { DocumentSymbol } from 'vs/editor/common/languages';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAideProbeModel, IAideProbeResponseModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeBreakdownContent, IAideProbeInitialSymbolInformation, IAideProbeStatus, IAideRelevantReferenceInformation, IReferenceByName } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { HunkInformation } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';

export interface IAideProbeViewModel {
	readonly onDidChange: Event<void>;
	readonly onChangeActiveBreakdown: Event<IAideProbeBreakdownViewModel>;
	readonly model: IAideProbeModel;
	readonly sessionId: string;
	readonly status: IAideProbeStatus;
	readonly initialSymbols: ReadonlyArray<IAideProbeInitialSymbolsViewModel>;
	readonly breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>;
}

export type IFollowupState = 'idle' | 'loading' | 'complete';

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

	get status(): IAideProbeStatus {
		return this._model.status;
	}

	private _lastFileOpened: URI | undefined;
	get lastFileOpened(): URI | undefined {
		return this._lastFileOpened;
	}

	private _isRepoMapReady: boolean | undefined;
	get isRepoMapReady(): boolean | undefined {
		return this._isRepoMapReady;
	}


	private _isLongContextSearchReady: boolean | undefined;
	get isLongContextSearchReady(): boolean | undefined {
		return this._isLongContextSearchReady;
	}

	private _breakdownsBySymbol: Map<string, Promise<IAideProbeBreakdownViewModel>> = new Map();

	_breakdowns: IAideProbeBreakdownViewModel[] = [];
	get breakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this._breakdowns;
	}

	private _initialSymbols: IAideProbeInitialSymbolsViewModel[] = [];
	get initialSymbols() {
		return this._initialSymbols;
	}

	private _referencesFound: IAideReferencesFoundViewModel | undefined;
	get referencesFound() {
		return this._referencesFound;
	}

	private _relevantReferences: IAideRelevantReferencesViewModel | undefined;
	get relevantReferences() {
		return this._relevantReferences;
	}

	private _followups: IAideFollowupsViewModel | undefined;
	get followups() {
		return this._followups;
	}

	get filteredBreakdowns(): ReadonlyArray<IAideProbeBreakdownViewModel> {
		return this.breakdowns.filter(b => {
			if (!this._filter) {
				return true;
			}
			return b.name.toLowerCase().includes(this._filter.toLowerCase()) || b.uri.path.toLowerCase().includes(this._filter.toLowerCase());
		});
	}

	constructor(
		private readonly _model: IAideProbeModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
	) {
		super();

		this._register(this._model.onClearResponse(() => {
			// TODO(@g-danna) Maybe dump the whole viewmodel on clear instead of setting these refs to undefined?
			this._references.clear();
			this._lastFileOpened = undefined;
			this._isRepoMapReady = undefined;
			this._isLongContextSearchReady = undefined;
			this._breakdownsBySymbol.clear();
			this._initialSymbols = [];
			this._referencesFound = undefined;
			this._relevantReferences = undefined;
			this._followups = undefined;
			this._onDidChange.fire();
		}));

		this._register(_model.onDidChange(async () => {
			if (!this._model.response) {
				return;
			}

			this._lastFileOpened = _model.response?.lastFileOpened;

			if (_model.request?.codebaseSearch) {
				this._isRepoMapReady = false;
				this._isLongContextSearchReady = false;

				if (_model.response?.repoMapGenerationFinished) {
					this._isRepoMapReady = true;
				}
				if (_model.response?.longContextSearchFinished) {
					this._isLongContextSearchReady = true;
				}
			}

			const codeEdits = _model.response?.codeEdits;

			if (this._model.response.initialSymbols) {
				this._initialSymbols = Array.from(this._model.response.initialSymbols.values()).flat().map(item => ({ ...item, type: 'initialSymbol', index: undefined, expanded: false, currentRenderedHeight: 0 }));
			}

			if (this._model.response.referencesFound) {
				const references: IAideReferencesFoundViewModel['references'] = {};
				if (Object.keys(this._references).length !== 0) {
					for (const [uri, occurencies] of Object.entries(this._model.response.referencesFound)) {
						references[uri] = { uri: URI.parse(uri), occurencies };
					}
					this._referencesFound = { references, type: 'referencesFound', index: undefined, expanded: false, currentRenderedHeight: 0 };
				}
			}

			if (this._model.response.relevantReferences) {
				this._relevantReferences = { references: this._model.response.relevantReferences, type: 'relevantReferences', index: undefined, expanded: false, currentRenderedHeight: 0 };
			}

			if (this._model.response.followups) {
				if (this._relevantReferences) {
					// Clear relevant references if there are followups
					this._relevantReferences = undefined;
				}
				const followups: Map<string, IAideFollowupViewModel[]> = new Map();
				for (const [key, value] of this._model.response.followups.entries()) {
					followups.set(key, value.map(({ reference }) => {
						return { reference };
					}));
				}

				this._followups = { followups, type: 'followups', index: undefined, expanded: false, currentRenderedHeight: 0 };
			}



			for (const [key, item] of this._model.response.breakdownsBySymbol.entries()) {
				if (!this._breakdownsBySymbol.has(key)) {
					let reference = this._references.get(item.reference.uri.toString());

					const createVM = async (response: IAideProbeResponseModel) => {

						if (!reference) {
							reference = await this.textModelResolverService.createModelReference(item.reference.uri);
						}

						const index = response.breakdowns.findIndex(
							b => equals(b.reference.name, item.reference.name) && equals(b.reference.uri, item.reference.uri)
						);

						const viewItem = this._register(this.instantiationService.createInstance(AideProbeBreakdownViewModel, item, reference, index));
						const symbol = await viewItem.symbol;

						if (symbol) {
							const edits = codeEdits?.get(item.reference.uri.toString());
							const hunks = edits?.hunkData.getInfo();
							for (const hunk of hunks ?? []) {
								let wholeRange: Range | undefined;
								const ranges = hunk.getRangesN();
								for (const range of ranges) {
									if (!wholeRange) {
										wholeRange = range;
									} else {
										wholeRange = wholeRange.plusRange(range);
									}
								}

								if (wholeRange && Range.areIntersecting(symbol.range, wholeRange)) {
									viewItem.appendEdits([hunk]);
								}
							}
						}

						return viewItem;
					};

					const vm = createVM(this._model.response);

					this._breakdownsBySymbol.set(key, vm);

					this._breakdowns.push(await vm);

					this._onDidChange.fire();
				}
			}

			// this._breakdowns = await Promise.all(_model.response?.breakdowns.map(async (item) => {
			// 	let reference = this._references.get(item.reference.uri.toString());
			// 	if (!reference) {
			// 		reference = await this.textModelResolverService.createModelReference(item.reference.uri);
			// 	}

			// 	const viewItem = this._register(this.instantiationService.createInstance(AideProbeBreakdownViewModel, item, reference));
			// 	viewItem.symbol.then(symbol => {
			// 		if (!symbol) {
			// 			return;
			// 		}

			// 		const edits = codeEdits?.get(item.reference.uri.toString());
			// 		const hunks = edits?.hunkData.getInfo();
			// 		for (const hunk of hunks ?? []) {
			// 			let wholeRange: Range | undefined;
			// 			const ranges = hunk.getRangesN();
			// 			for (const range of ranges) {
			// 				if (!wholeRange) {
			// 					wholeRange = range;
			// 				} else {
			// 					wholeRange = wholeRange.plusRange(range);
			// 				}
			// 			}

			// 			if (wholeRange && Range.areIntersecting(symbol.range, wholeRange)) {
			// 				viewItem.appendEdits([hunk]);
			// 			}
			// 		}
			// 		this._onDidChange.fire();
			// 	});

			// 	return viewItem;
			// }) ?? []);

			this._onDidChange.fire();
		}));
	}
}

export interface IAideProbeInitialSymbolsViewModel extends IAideProbeInitialSymbolInformation {
	type: 'initialSymbol';
	index: number | undefined;
	currentRenderedHeight: number | undefined;
	expanded: boolean;
}

export interface IAideProbeBreakdownViewModel {
	type: 'breakdown';
	readonly uri: URI;
	readonly name: string;
	readonly query?: IMarkdownString;
	readonly reason?: IMarkdownString;
	readonly response?: IMarkdownString;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	readonly edits: HunkInformation[];
	// List view specific
	index: number | undefined;
	currentRenderedHeight: number | undefined;
	expanded: boolean;
}

export interface IAideReferencesFoundViewModel {
	type: 'referencesFound';
	readonly references: Record<string, { uri: URI; occurencies: number }>;
	index: number | undefined;
	currentRenderedHeight: number | undefined;
	expanded: boolean;
	toDispose?: DisposableStore;
}

export interface IAideRelevantReferencesViewModel {
	type: 'relevantReferences';
	readonly references: Map<string, IAideRelevantReferenceInformation>;
	index: number | undefined;
	currentRenderedHeight: number | undefined;
	expanded: boolean;
	toDispose?: DisposableStore;
}

export interface IAideFollowupViewModel {
	reference: IReferenceByName;
	//state: IFollowupState;
}


export interface IAideFollowupsViewModel {
	type: 'followups';
	readonly followups: Map<string, IAideFollowupViewModel[]>;
	index: number | undefined;
	currentRenderedHeight: number | undefined;
	expanded: boolean;
	toDispose?: DisposableStore;
}


export type IAideProbeListItem = IAideProbeInitialSymbolsViewModel | IAideProbeBreakdownViewModel | IAideReferencesFoundViewModel | IAideRelevantReferencesViewModel | IAideFollowupsViewModel;

export function isInitialSymbolsVM(item: unknown): item is IAideProbeInitialSymbolsViewModel {
	return !!item && typeof (item as IAideProbeInitialSymbolsViewModel).symbolName !== 'undefined';
}

export function isBreakdownVM(item: unknown): item is IAideProbeBreakdownViewModel {
	return !!item && typeof (item as IAideProbeBreakdownViewModel).edits !== 'undefined';
}

export function isReferenceFoundVM(item: unknown): item is IAideReferencesFoundViewModel {
	return !!item && (item as IAideReferencesFoundViewModel).type === 'referencesFound';
}

export function isRelevantReferencesVM(item: unknown): item is IAideRelevantReferencesViewModel {
	return !!item && (item as IAideRelevantReferencesViewModel).type === 'relevantReferences';
}

export function isFollowupsVM(item: unknown): item is IAideFollowupsViewModel {
	return !!item && (item as IAideFollowupsViewModel).type === 'followups';
}

export interface IAideProbeCodeEditPreviewViewModel {
	readonly uri: URI;
	readonly range: Range;
	readonly symbol: Promise<DocumentSymbol | undefined>;
	isRendered: boolean;
}

export class AideProbeBreakdownViewModel extends Disposable implements IAideProbeBreakdownViewModel {

	readonly type = 'breakdown';

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

	expanded = false;
	index: number | undefined;

	_breakdownIndex: number;
	get breakdownIndex() {
		return this._breakdownIndex;
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

	private _edits: HunkInformation[] = [];
	get edits() {
		return this._edits;
	}

	appendEdits(edits: HunkInformation[]) {
		this._edits.push(...edits);
	}

	constructor(
		private readonly _breakdown: IAideProbeBreakdownContent,
		private readonly reference: IReference<IResolvedTextEditorModel>,
		breakdownIndex: number,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService,
	) {
		super();

		this._breakdownIndex = breakdownIndex;

		if (_breakdown.reference.uri && _breakdown.reference.name) {
			this._symbolResolver = async () => {
				this._symbol = await this.resolveSymbol();
				return this._symbol;
			};
			this._symbolResolver();
		}
	}

	private async resolveSymbol(): Promise<DocumentSymbol | undefined> {
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
