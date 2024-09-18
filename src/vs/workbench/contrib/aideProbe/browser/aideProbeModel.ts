/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { IOffsetRange } from '../../../../editor/common/core/offsetRange.js';
import { Location, IWorkspaceFileEdit, IWorkspaceTextEdit, WorkspaceEdit } from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DefaultModelSHA1Computer } from '../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { CONTEXT_PROBE_REQUEST_STATUS } from '../../../../workbench/contrib/aideProbe/browser/aideProbeContextKeys.js';
import { AideProbeStatus, IAideFollowupInformation, IAideProbeBreakdownContent, IAideProbeGoToDefinition, IAideProbeInitialSymbolInformation, IAideProbeInitialSymbols, IAideProbeMode, IAideProbeProgress, IAideProbeRequestModel, IAideProbeResponseEvent, IAideProbeStatus, IAideProbeTextEdit, IAideRelevantReference, IAideRelevantReferenceInformation } from '../../../../workbench/contrib/aideProbe/common/aideProbe.js';

import { HunkData } from '../../../../workbench/contrib/inlineChat/browser/inlineChatSession.js';
import { ITextFileService } from '../../../../workbench/services/textfile/common/textfiles.js';
import { IChatRequestVariableData, IChatTextEditGroupState } from '../../chat/common/chatModel.js';

export interface IContentVariableReference {
	variableName: string;
	value?: URI | Location;
}

interface IContentReference {
	reference: URI | Location | IContentVariableReference;
	iconPath?: ThemeIcon | { light: URI; dark?: URI };
	kind: 'reference';
}

// TODO(@g-danna) use the aideChat one or make our own
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
	readonly textModelN: ITextModel;
	textModel0: ITextModel;
	hunkData: HunkData;
	textModelNDecorations?: IModelDeltaDecoration[];
}

export interface IAideProbeResponseModel {
	result?: IMarkdownString;
	readonly lastFileOpened?: URI;
	readonly breakdowns: ReadonlyArray<IAideProbeBreakdownContent>;
	readonly goToDefinitions: ReadonlyArray<IAideProbeGoToDefinition>;
	readonly initialSymbols: ReadonlyMap<string, IAideProbeInitialSymbolInformation[]>;
	readonly referencesFound: Record<string, number> | undefined;
	readonly relevantReferences: Map<string, IAideRelevantReferenceInformation> | undefined;
	readonly followups: Map<string, IAideFollowupInformation[]> | undefined;
	readonly codeEdits: ReadonlyMap<string, IAideProbeEdits | undefined>;
	readonly repoMapGenerationFinished: boolean | undefined;
	readonly longContextSearchFinished: boolean | undefined;
}

export interface IAideProbeModel {
	onDidChange: Event<void>;
	onNewEvent: Event<IAideProbeResponseEvent>;
	onClearResponse: Event<void>;
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
		readonly codebaseSearch: boolean,
		readonly mode: IAideProbeMode
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

	private _referencesFound: Record<string, number> | undefined;
	public get referencesFound(): Record<string, number> | undefined {
		return this._referencesFound;
	}


	private _relevantReferences: Map<string, IAideRelevantReferenceInformation> | undefined;
	public get relevantReferences(): Map<string, IAideRelevantReferenceInformation> | undefined {
		return this._relevantReferences;
	}

	private _followups: Map<string, IAideFollowupInformation[]> | undefined;
	public get followups(): Map<string, IAideFollowupInformation[]> | undefined {
		return this._followups;
	}

	private progressiveEditsQueue = this._register(new Queue());
	private readonly _codeEdits: Map<string, IAideProbeEdits> = new Map();
	public get codeEdits(): ReadonlyMap<string, IAideProbeEdits | undefined> {
		return this._codeEdits;
	}

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService
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

	applyReferenceFound(references: Record<string, number>) {
		this._referencesFound = references;
	}

	applyRelevantReferences(relevantReference: IAideRelevantReference) {
		if (!this._relevantReferences) {
			this._relevantReferences = new Map();
		}
		const mapKey = `${relevantReference.reference.uri.toString()}:${relevantReference.reference.symbolName}`;
		this._relevantReferences.set(mapKey, relevantReference.reference);
	}

	applyFollowups(followups: Record<string, IAideFollowupInformation[]>) {
		this._followups = new Map(Object.entries(followups));
	}

	async applyCodeEdit(codeEdit: IAideProbeTextEdit) {
		for (const workspaceEdit of codeEdit.edits.edits) {
			if (ResourceTextEdit.is(workspaceEdit)) {
				await this.progressiveEditsQueue.queue(async () => {
					await this.processWorkspaceEdit(workspaceEdit);
				});
				this._onNewEvent.fire({ kind: 'edit', resource: workspaceEdit.resource, edit: workspaceEdit.textEdit });
			}
		}
	}

	private async processWorkspaceEdit(workspaceEdit: IWorkspaceTextEdit | IWorkspaceFileEdit) {
		if (ResourceTextEdit.is(workspaceEdit)) {
			const resource = workspaceEdit.resource;
			const mapKey = `${resource.toString()}`;

			let codeEdits: IAideProbeEdits;
			if (this._codeEdits.has(mapKey)) {
				codeEdits = this._codeEdits.get(mapKey)!;
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


				this.undoRedoService.createSnapshot(textModelN.uri);

				codeEdits = {
					targetUri: resource.toString(),
					textModel0,
					textModelN,
					hunkData: this._register(new HunkData(this._editorWorkerService, textModel0, textModelN)),
				};
				this._codeEdits.set(mapKey, codeEdits);
			}

			codeEdits.hunkData.ignoreTextModelNChanges = true;
			codeEdits.textModelN.applyEdits([workspaceEdit.textEdit]);

			this._register(codeEdits.textModelN.onDidChangeContent(e => {
				if (e.isUndoing) {
					this._onNewEvent.fire({ kind: 'undoEdit', resource: URI.parse(codeEdits.targetUri), changes: e.changes });
				}
			}));

			const { editState, diff } = await this.calculateDiff(codeEdits.textModel0, codeEdits.textModelN);
			await codeEdits.hunkData.recompute(editState, diff);

			codeEdits.hunkData.ignoreTextModelNChanges = false;

			this._onNewEvent.fire({ kind: 'completeEdit', resource: URI.parse(codeEdits.targetUri) });
		}
	}

	private async calculateDiff(textModel0: ITextModel, textModelN: ITextModel) {
		const sha1 = new DefaultModelSHA1Computer();
		const textModel0Sha1 = sha1.canComputeSHA1(textModel0)
			? sha1.computeSHA1(textModel0)
			: generateUuid();
		const editState: IChatTextEditGroupState = { sha1: textModel0Sha1, applied: 0 };
		const diff = await this._editorWorkerService.computeDiff(textModel0.uri, textModelN.uri, { computeMoves: true, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, ignoreTrimWhitespace: false }, 'advanced');
		return { editState, diff };
	}

	async addToUndoStack() {
		const redoEdits: WorkspaceEdit = { edits: [] };
		this._onNewEvent.fire({ kind: 'discardAll' });
		for (const aideEdit of this._codeEdits.values()) {
			const operations = aideEdit.hunkData.discardAll(false);
			for (const operation of operations) {
				redoEdits.edits.push({ resource: aideEdit.textModelN.uri, textEdit: operation, versionId: undefined });
			}
		}
		await this._bulkEditService.apply(redoEdits);

		for (const aideEdit of this._codeEdits.values()) {
			this._textFileService.save(aideEdit.textModelN.uri);
		}
	}
}

export class AideProbeModel extends Disposable implements IAideProbeModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	protected readonly _onClearResponse = this._store.add(new Emitter<void>());
	readonly onClearResponse: Event<void> = this._onClearResponse.event;

	protected readonly _onNewEvent = this._store.add(new Emitter<IAideProbeResponseEvent>());
	readonly onNewEvent: Event<IAideProbeResponseEvent> = this._onNewEvent.event;

	protected readonly _onDidChangeStatus = this._store.add(new Emitter<IAideProbeStatus>());
	readonly onDidChangeStatus: Event<IAideProbeStatus> = this._onDidChangeStatus.event;

	private _request: AideProbeRequestModel | undefined;
	private _response: AideProbeResponseModel | undefined;
	private _status: IContextKey<IAideProbeStatus>;

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

	clearResponse() {
		this._response?.dispose();
		this._onClearResponse.fire();
		this._response = undefined;
	}

	get status() {
		return this._status.get() || AideProbeStatus.INACTIVE;
	}

	set status(newStatus: IAideProbeStatus) {
		const didChange = this._status.get() !== newStatus;
		if (didChange) {
			this._status.set(newStatus);
			this._onDidChangeStatus.fire(newStatus);
		}
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this._sessionId = generateUuid();
		this._status = CONTEXT_PROBE_REQUEST_STATUS.bindTo(contextKeyService);

	}

	async acceptResponseProgress(progress: IAideProbeProgress): Promise<void> {
		if (!this._request) {
			throw new Error('Request not yet initialised');
		}

		if (!this._response) {
			this._response = this._register(this._instantiationService.createInstance(AideProbeResponseModel));
			this._register(this._response.onNewEvent(responseEvent => this._onNewEvent.fire(responseEvent)));
		}

		this.status = AideProbeStatus.IN_PROGRESS;

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
			case 'iterationFinished':
				await this._response.addToUndoStack();
				this.status = AideProbeStatus.ITERATION_FINISHED;
				break;
			case 'referenceFound':
				this._response.applyReferenceFound(progress.references);
				break;
			case 'relevantReference':
				this._response.applyRelevantReferences(progress);
				break;
			case 'followups':
				this._response.applyFollowups(progress.followups);
				break;
			case 'textEdit':
				await this._response.applyCodeEdit(progress);
				break;
		}
		this._onDidChange.fire();
	}

	async completeResponse() {
		if (this._response) {
			await this._response.addToUndoStack();
		}
		this.status = AideProbeStatus.IN_REVIEW;
		this._onDidChange.fire();
	}

	cancelRequest(): void {
		this.status = AideProbeStatus.IN_REVIEW;
		this._onDidChange.fire();
	}
}
