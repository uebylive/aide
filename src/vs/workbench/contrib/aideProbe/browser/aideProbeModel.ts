/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { equals } from 'vs/base/common/objects';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IOffsetRange } from 'vs/editor/common/core/offsetRange';
import { Location, IWorkspaceFileEdit, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { IIdentifiedSingleEditOperation, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatRequestVariableData } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideProbeBreakdownContent, IAideProbeGoToDefinition, IAideProbeInitialSymbolInformation, IAideProbeInitialSymbols, IAideProbeProgress, IAideProbeRequestModel, IAideProbeResponseEvent, IAideProbeTextEdit } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';


export interface IContentVariableReference {
	variableName: string;
	value?: URI | Location;
}

interface IContentReference {
	reference: URI | Location | IContentVariableReference;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	kind: 'reference';
}

export interface IVariableEntry {
	id: string;
	fullName?: string;
	icon?: ThemeIcon;
	name: string;
	modelDescription?: string;
	range?: IOffsetRange;
	value: string | URI | Location | unknown;
	references?: IContentReference[];
	isDynamic?: boolean;
	isFile?: boolean;
}

export interface IAideProbeEdits {
	readonly targetUri: string;
	readonly textModel0: ITextModel;
	readonly textModelN: ITextModel;
	//readonly hunkData: HunkData;
	readonly undoEdits: IValidEditOperation[];
	readonly iterationId: string;
	readonly edits: IWorkspaceTextEdit[];
	textModelNDecorations?: IModelDeltaDecoration[];
}

export interface IAideProbeResponseModel {
	result?: IMarkdownString;
	readonly lastFileOpened?: URI;
	readonly breakdowns: ReadonlyArray<IAideProbeBreakdownContent>;
	readonly goToDefinitions: ReadonlyArray<IAideProbeGoToDefinition>;
	readonly initialSymbols: ReadonlyMap<string, IAideProbeInitialSymbolInformation[]>;
	readonly codeEdits: ReadonlyMap<string, IAideProbeEdits | undefined>;
	readonly repoMapGenerationFinished: boolean | undefined;
	readonly longContextSearchFinished: boolean | undefined;
}


export const enum AideProbeStatus {
	INACTIVE = 'INACTIVE',
	IN_PROGRESS = 'IN_PROGRESS',
	IN_REVIEW = 'IN_REVIEW'
}

export type IAideProbeStatus = keyof typeof AideProbeStatus;

export interface IAideProbeModel {
	onDidChange: Event<void>;
	onNewEvent: Event<IAideProbeResponseEvent>;
	sessionId: string;
	request: IAideProbeRequestModel | undefined;
	response: IAideProbeResponseModel | undefined;
	status: IAideProbeStatus;
}

export class AideProbeRequestModel extends Disposable implements IAideProbeRequestModel {
	constructor(
		readonly sessionId: string,
		readonly message: string,
		readonly variableData: IChatRequestVariableData,
		readonly editMode: boolean,
		readonly codebaseSearch: boolean,
	) {
		super();
	}
}

export class AideProbeResponseModel extends Disposable implements IAideProbeResponseModel {
	protected readonly _onNewEvent = this._store.add(new Emitter<IAideProbeResponseEvent>());
	readonly onNewEvent: Event<IAideProbeResponseEvent> = this._onNewEvent.event;

	private _result: IMarkdownString | undefined;
	get result(): IMarkdownString | undefined {
		return this._result;
	}

	set result(value: IMarkdownString) {
		this._result = value;
	}

	private _lastFileOpened: URI | undefined;
	get lastFileOpened(): URI | undefined {
		return this._lastFileOpened;
	}
	set lastFileOpened(value: URI) {
		this._lastFileOpened = value;
	}

	private _repoMapGenerationFinished: boolean | undefined;
	get repoMapGenerationFinished(): boolean | undefined {
		return this._repoMapGenerationFinished;
	}
	set repoMapGenerationFinished(value: boolean) {
		this._repoMapGenerationFinished = value;
	}

	private _longContextSearchFinished: boolean | undefined;
	get longContextSearchFinished(): boolean | undefined {
		return this._longContextSearchFinished;
	}
	set longContextSearchFinished(value: boolean) {
		this._longContextSearchFinished = value;
	}

	private readonly _breakdownsBySymbol: Map<string, IAideProbeBreakdownContent> = new Map();
	private readonly _breakdowns: IAideProbeBreakdownContent[] = [];

	public get breakdowns(): ReadonlyArray<IAideProbeBreakdownContent> {
		return this._breakdowns;
	}

	private readonly _goToDefinitions: IAideProbeGoToDefinition[] = [];
	public get goToDefinitions(): ReadonlyArray<IAideProbeGoToDefinition> {
		return this._goToDefinitions;
	}

	private readonly _initialSymbols: Map<string, IAideProbeInitialSymbolInformation[]> = new Map();
	public get initialSymbols(): ReadonlyMap<string, IAideProbeInitialSymbolInformation[]> {
		return this._initialSymbols;
	}

	private _iterations: Set<string> = new Set();
	private _iterationsOrder: string[] = [];
	//private _currentIterationIndex = 0;
	private progressiveEditsQueue = this._register(new Queue());
	private readonly _codeEdits: Map<string, IAideProbeEdits> = new Map();
	public get codeEdits(): ReadonlyMap<string, IAideProbeEdits | undefined> {
		return this._codeEdits;
	}

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ITextModelService private readonly _textModelService: ITextModelService
	) {
		super();
	}

	applyBreakdown(breakdown: IAideProbeBreakdownContent) {
		const mapKey = `${breakdown.reference.uri.toString()}:${breakdown.reference.name}`;
		const { query, reason, response } = breakdown;
		if (this._breakdownsBySymbol.has(mapKey)) {
			if (query && query.value.length > 0) {
				this._breakdownsBySymbol.get(mapKey)!.query = query;
			}
			if (reason && reason.value.length > 0) {
				this._breakdownsBySymbol.get(mapKey)!.reason = reason;
			}
			if (response && response.value.length > 0) {
				this._breakdownsBySymbol.get(mapKey)!.response = response;
			}
			// Update the breakdown in the list
			const index = this._breakdowns.findIndex(
				b => equals(b.reference.name, breakdown.reference.name) && equals(b.reference.uri, breakdown.reference.uri)
			);
			if (index !== -1) {
				this._breakdowns[index] = this._breakdownsBySymbol.get(mapKey)!;
			}
		} else {
			this._breakdownsBySymbol.set(mapKey, breakdown);
			this._breakdowns.push(breakdown);
		}

		this._onNewEvent.fire(breakdown);
	}

	applyGoToDefinition(goToDefinition: IAideProbeGoToDefinition) {
		const existing = this._goToDefinitions.find(gtd => equals(gtd.uri, goToDefinition.uri) && equals(gtd.name, goToDefinition.name));
		if (existing) {
			return;
		}

		this._goToDefinitions.push(goToDefinition);
	}

	applyInitialSymbols(initialSymbols: IAideProbeInitialSymbols) {
		initialSymbols.symbols.forEach(symbol => {
			const uri = symbol.uri.toString();
			if (!this._initialSymbols.has(uri)) {
				this._initialSymbols.set(uri, [symbol]);
			} else {
				const symbolInfo = this._initialSymbols.get(uri);
				if (symbolInfo) {
					symbolInfo.push(symbol);
				}
			}
		});

		this._onNewEvent.fire(initialSymbols);
	}

	async applyCodeEdit(codeEdit: IAideProbeTextEdit) {
		for (const workspaceEdit of codeEdit.edits.edits) {
			if (ResourceTextEdit.is(workspaceEdit)) {
				this.progressiveEditsQueue.queue(async () => {
					await this.processWorkspaceEdit(workspaceEdit, codeEdit.iterationId);
				});
			}
		}
	}

	async undoEdit() {
		if (this._iterationsOrder.length === 0) {
			return;
		}
		const iterationId = this._iterationsOrder.pop();
		if (iterationId) {
			await this.undoIteration(iterationId);
		}
	}


	private async undoIteration(iterationId: string) {
		for (const [mapKey, codeEdits] of this._codeEdits.entries()) {
			if (codeEdits.iterationId === iterationId && codeEdits.undoEdits) {
				// Apply undo edits
				codeEdits.textModelN.pushEditOperations(null, codeEdits.undoEdits, () => null);

				//console.log(codeEdits.textModelN.getValue());
				// Save the changes
				// await this._textFileService.save(codeEdits.textModelN.uri);

				// Remove this iteration from the set and order
				this._iterations.delete(iterationId);
				this._iterationsOrder = this._iterationsOrder.filter(id => id !== iterationId);

				// Remove the edits for this iteration
				this._codeEdits.delete(mapKey);
			}
		}


		//const codeEdits = this._codeEdits.values();
		//for (const codeEdit of codeEdits) {
		//	if (codeEdit && codeEdit.iterationId === iterationId) {
		//		const textModel0 = codeEdit.textModel0;
		//		const textModelN = codeEdit.textModelN;
		//		const edits = codeEdit.edits;
		//		for (const edit of edits) {
		//			const editOperation: IIdentifiedSingleEditOperation = {
		//				range: edit.textEdit.range,
		//				text: edit.textEdit.text
		//			};
		//			textModelN.pushEditOperations(null, [editOperation], (undoEdits) => {
		//				this._onNewEvent.fire({ kind: 'undoEdit', resource: URI.parse(codeEdit.targetUri), edits: undoEdits });
		//				return null;
		//			});
		//		}
		//		await this._textFileService.save(textModelN.uri);
		//	}
		//}
	}

	private async processWorkspaceEdit(workspaceEdit: IWorkspaceTextEdit | IWorkspaceFileEdit, iterationId: string) {
		if (ResourceTextEdit.is(workspaceEdit)) {
			if (!this._iterations.has(iterationId)) {
				this._iterations.add(iterationId);
				this._iterationsOrder.push(iterationId);
				//this._currentIterationIndex = this._iterationsOrder.length - 1;
			}
			const resource = workspaceEdit.resource;
			const mapKey = `${resource.toString()}`;

			let codeEdits: IAideProbeEdits;
			if (this._codeEdits.has(mapKey)) {
				codeEdits = this._codeEdits.get(mapKey)!;
				codeEdits.edits.push(workspaceEdit);
			} else {
				let textModel = this._modelService.getModel(resource);
				if (!textModel) {
					const ref = await this._textModelService.createModelReference(resource);
					textModel = ref.object.textEditorModel;
					ref.dispose();
				}
				const textModelN = textModel;

				const id = generateUuid();
				const textModel0 = this._register(this._modelService.createModel(
					createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
					{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
					resource.with({ scheme: Schemas.vscode, authority: 'aide-probe-commandpalette', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
				));

				codeEdits = {
					targetUri: resource.toString(),
					textModel0,
					textModelN,
					iterationId,
					undoEdits: [],
					//hunkData: this._register(new HunkData(this._editorWorkerService, textModel0, textModelN)),
					edits: [workspaceEdit]
				};
				this._codeEdits.set(mapKey, codeEdits);
			}

			const editOperation: IIdentifiedSingleEditOperation = {
				range: workspaceEdit.textEdit.range,
				text: workspaceEdit.textEdit.text
			};

			//codeEdits.hunkData.ignoreTextModelNChanges = true;
			codeEdits.textModelN.pushEditOperations(null, [editOperation], (undoEdits) => {
				codeEdits.undoEdits.push(...undoEdits);
				this._onNewEvent.fire({ kind: 'startEdit', resource: URI.parse(codeEdits.targetUri), edits: undoEdits });
				return null;
			});
			this._register(codeEdits.textModelN.onDidChangeContent(e => {
				if (e.isUndoing) {
					this._onNewEvent.fire({ kind: 'undoEdit', resource: URI.parse(codeEdits.targetUri), changes: e.changes });
				}
			}));
			await this._textFileService.save(codeEdits.textModelN.uri);

			//const sha1 = new DefaultModelSHA1Computer();
			//const textModel0Sha1 = sha1.canComputeSHA1(codeEdits.textModel0)
			//	? sha1.computeSHA1(codeEdits.textModel0)
			//	: generateUuid();
			//const editState: IChatTextEditGroupState = { sha1: textModel0Sha1, applied: 0 };
			//const diff = await this._editorWorkerService.computeDiff(codeEdits.textModel0.uri, codeEdits.textModelN.uri, { computeMoves: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
			//await codeEdits.hunkData.recompute(editState, diff);
			//codeEdits.hunkData.ignoreTextModelNChanges = false;
			this._onNewEvent.fire({ kind: 'completeEdit', resource: URI.parse(codeEdits.targetUri) });
		}
	}
}

export class AideProbeModel extends Disposable implements IAideProbeModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	protected readonly _onNewEvent = this._store.add(new Emitter<IAideProbeResponseEvent>());
	readonly onNewEvent: Event<IAideProbeResponseEvent> = this._onNewEvent.event;

	private _request: AideProbeRequestModel | undefined;
	private _response: AideProbeResponseModel | undefined;
	private _status: IAideProbeStatus = AideProbeStatus.INACTIVE;

	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get request(): IAideProbeRequestModel | undefined {
		return this._request;
	}

	set request(value: AideProbeRequestModel) {
		this._request = value;
	}

	get response(): AideProbeResponseModel | undefined {
		return this._response;
	}

	get status() {
		return this._status;
	}

	set status(_status: IAideProbeStatus) {
		this._status = _status;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._sessionId = generateUuid();
	}

	async acceptResponseProgress(progress: IAideProbeProgress): Promise<void> {
		if (!this._request) {
			throw new Error('Request not yet initialised');
		}

		if (!this._response) {
			this._response = this._register(this._instantiationService.createInstance(AideProbeResponseModel));
			this._register(this._response.onNewEvent(edits => this._onNewEvent.fire(edits)));
		}

		this._status = AideProbeStatus.IN_PROGRESS;

		switch (progress.kind) {
			case 'markdownContent':
				this._response.result = progress.content;
				break;
			case 'initialSymbols':
				this._response.applyInitialSymbols(progress);
				break;
			case 'openFile':
				this._response.lastFileOpened = progress.uri;
				break;
			case 'breakdown':
				this._response.applyBreakdown(progress);
				break;
			case 'goToDefinition':
				this._response.applyGoToDefinition(progress);
				break;
			case 'repoMapGeneration':
				this._response.repoMapGenerationFinished = progress.finished;
				break;
			case 'longContextSearch':
				this._response.longContextSearchFinished = progress.finished;
				break;
			case 'textEdit':
				await this._response.applyCodeEdit(progress);
				break;
		}

		this._onDidChange.fire();
	}

	completeResponse(): void {
		this._status = AideProbeStatus.IN_REVIEW;

		this._onDidChange.fire();
	}

	cancelRequest(): void {
		this._status = AideProbeStatus.IN_REVIEW;

		this._onDidChange.fire();
	}
}
