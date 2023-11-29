/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, Queue, createCancelablePromise } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { MovingAverage } from 'vs/base/common/numbers';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ICSChatWidgetService, IChatWidget } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ICSChatAgentEditRequest, ICSChatAgentEditResponse, ICSChatAgentService } from 'vs/workbench/contrib/csChat/common/csChatAgents';
import { CONTEXT_CHAT_EDIT_IN_PROGRESS } from 'vs/workbench/contrib/csChat/common/csChatContextKeys';
import { IChatResponseViewModel } from 'vs/workbench/contrib/csChat/common/csChatViewModel';
import { countWords } from 'vs/workbench/contrib/csChat/common/csChatWordCounter';
import { ProgressingEditsOptions, asProgressiveEdit, performAsyncTextEdit } from 'vs/workbench/contrib/inlineCSChat/browser/inlineCSChatStrategies';

interface ICSChatCodeblockTextModels {
	textModel0: ITextModel;
	textModelN: ITextModel;
	textModelNAltVersion: number;
	textModelNSnapshotAltVersion: number | undefined;
}

export const ICSChatEditSessionService = createDecorator<ICSChatEditSessionService>('csChatEditSessionService');

interface ICSChatEditSessionService {
	sendEditRequest(responseVM: IChatResponseViewModel, request: ICSChatAgentEditRequest): Promise<{ responseCompletePromise: Promise<void> } | undefined>;
	confirmEdits(codeblockIndex: number, uri: URI, apply: boolean): Promise<void>;
}

export abstract class EditModeStrategy {
	abstract dispose(): void;
	abstract apply(): Promise<void>;
	abstract cancel(): Promise<void>;
	abstract makeProgressiveChanges(edits: ISingleEditOperation[], timings: ProgressingEditsOptions): Promise<void>;
	abstract makeChanges(edits: ISingleEditOperation[]): Promise<void>;
	abstract undoChanges(altVersionId: number): Promise<void>;
	abstract renderChanges(): Promise<void>;
}

export class ChatEditSessionService extends Disposable implements ICSChatEditSessionService {
	private codeblockEditInProgress: IContextKey<boolean>;
	private _pendingRequests = new Map<string, CancelablePromise<void>>();

	private readonly textModels = new Map<URI, ICSChatCodeblockTextModels>();
	private readonly editStrategies = new Map<URI, EditModeStrategy>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ICSChatWidgetService private readonly chatWidgetService: ICSChatWidgetService,
		@ICSChatAgentService protected readonly csChatAgentService: ICSChatAgentService,
	) {
		super();
		this.codeblockEditInProgress = CONTEXT_CHAT_EDIT_IN_PROGRESS.bindTo(contextKeyService);
	}

	async sendEditRequest(responseVM: IChatResponseViewModel, request: ICSChatAgentEditRequest): Promise<{ responseCompletePromise: Promise<void> } | undefined> {
		this.codeblockEditInProgress.set(true);
		const widget = this.chatWidgetService.getWidgetBySessionId(responseVM.sessionId);
		if (!widget) {
			this.error('sendRequest', 'Edit session not initialised');
			return;
		}

		if (this._pendingRequests.has(responseVM.sessionId)) {
			this.trace('sendRequest', `Session ${responseVM.sessionId} already has a pending request`);
			return;
		}

		const responseCompletePromise = this._sendEditRequestAsync(widget, responseVM, request);
		return { responseCompletePromise };
	}

	private async _sendEditRequestAsync(widget: IChatWidget, responseVM: IChatResponseViewModel, request: ICSChatAgentEditRequest): Promise<void> {
		const rawResponsePromise = createCancelablePromise<void>(async token => {
			const progressiveEditsAvgDuration = new MovingAverage();
			const progressiveEditsCts = new CancellationTokenSource(token);
			const progressiveEditsClock = StopWatch.create();
			const progressiveEditsQueue = new Queue();

			const progressCallback = async (progress: ICSChatAgentEditResponse) => {
				if (token.isCancellationRequested) {
					return;
				}

				responseVM.recordEdit(progress);

				progressiveEditsAvgDuration.update(progressiveEditsClock.elapsed());
				progressiveEditsClock.reset();

				progressiveEditsQueue.queue(async () => {
					if (progressiveEditsCts.token.isCancellationRequested) {
						return;
					}

					const editOperations: { uri: URI; edit: ISingleEditOperation }[] = progress.edits.edits.map(edit => {
						const typedEdit = edit as IWorkspaceTextEdit;
						return {
							uri: typedEdit.resource,
							edit: {
								range: Range.lift(typedEdit.textEdit.range),
								text: typedEdit.textEdit.text,
							}
						};
					});

					for (const editOp of editOperations) {
						this._makeChanges(widget, editOp.uri, editOp.edit, {
							duration: progressiveEditsAvgDuration.value,
							token: progressiveEditsCts.token,
						});
					}
				});
			};

			const listener = token.onCancellationRequested(() => {
				// TODO: Cancel the request
			});

			try {
				const response = await this.csChatAgentService.makeEdits(request, progressCallback, token);
				if (token.isCancellationRequested) {
					return;
				} else if (!response) {
					return;
				}
				// TODO: Handle response
			} finally {
				listener.dispose();
			}
		});

		this._pendingRequests.set(responseVM.sessionId, rawResponsePromise);
		rawResponsePromise.finally(() => {
			this.codeblockEditInProgress.set(false);
			this._pendingRequests.delete(responseVM.sessionId);
		});
		return rawResponsePromise;
	}

	private async _makeChanges(widget: IChatWidget, uri: URI, edit: ISingleEditOperation, opts: ProgressingEditsOptions | undefined) {
		const textModels = await this.getTextModels(uri);
		let codeEditor: ICodeEditor | undefined | null = this.codeEditorService.listCodeEditors().find(editor => editor.getModel()?.uri.toString() === uri.toString());
		if (!codeEditor) {
			codeEditor = await this.codeEditorService.openCodeEditor(
				{ resource: uri },
				this.codeEditorService.getFocusedCodeEditor()
			);

			if (!codeEditor) {
				this.error('sendRequest', `Failed to find code editor for ${uri.toString()}`);
			}
		}

		if (!codeEditor) {
			return;
		}

		let editStrategy = this.editStrategies.get(uri);
		if (!editStrategy) {
			const scopedInstantiationService = this.instaService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
			editStrategy = scopedInstantiationService.createInstance(LiveStrategy, textModels, codeEditor, widget);
			this.editStrategies.set(uri, editStrategy);
		}

		if (opts) {
			await editStrategy.makeProgressiveChanges([edit], opts);
		} else {
			await editStrategy.makeChanges([edit]);
		}

		await editStrategy.renderChanges();
	}

	private async getTextModels(uri: URI): Promise<ICSChatCodeblockTextModels> {
		const textModel = this.textModels.get(uri);
		if (!textModel) {
			const textModelN = this.modelService.getModel(uri);
			if (!textModelN) {
				this.error('getTextModels', `Text model for ${uri.toString()} not found`);
				throw new Error(`Text model for ${uri.toString()} not found`);
			}

			const textModel0 = this.modelService.createModel(
				createTextBufferFactoryFromSnapshot(textModelN.createSnapshot()),
				{ languageId: textModelN.getLanguageId(), onDidChange: Event.None },
				undefined, true
			);

			const model = {
				textModel0,
				textModelN,
				textModelNAltVersion: textModelN.getAlternativeVersionId(),
				textModelNSnapshotAltVersion: undefined
			};
			this.textModels.set(uri, model);
			return model;
		}
		return textModel;
	}

	confirmEdits(codeblockIndex: number, uri: URI, apply: boolean): Promise<void> {
		const editStrategy = this.editStrategies.get(uri);
		if (!editStrategy) {
			this.error('confirmEdits', `Edit strategy for ${uri.toString()} not found`);
			return Promise.resolve();
		}

		if (apply) {
			return editStrategy.apply();
		} else {
			return editStrategy.cancel();
		}
	}

	private trace(method: string, message: string): void {
		this.logService.trace(`CSChatEditSession#${method}: ${message}`);
	}

	private error(method: string, message: string): void {
		this.logService.error(`CSChatEditSession#${method} ${message}`);
	}

	public override dispose(): void {
		super.dispose();
		for (const editStrategy of this.editStrategies.values()) {
			editStrategy.dispose();
		}
		this.editStrategies.clear();
	}
}

export class LiveStrategy extends EditModeStrategy {

	protected _diffEnabled: boolean = false;

	private readonly _diffDecorations: CSChatEditsDiffDecorations;
	private readonly _store: DisposableStore = new DisposableStore();

	private _editCount: number = 0;

	constructor(
		protected readonly _models: ICSChatCodeblockTextModels,
		protected readonly _editor: ICodeEditor,
		protected readonly _widget: IChatWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super();
		this._diffEnabled = configService.getValue<boolean>('inlineChat.showDiff');

		this._diffDecorations = new CSChatEditsDiffDecorations(this._editor, this._diffEnabled);
		this._diffDecorations.visible = this._diffEnabled;

		this._store.add(configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('inlineChat.showDiff')) {
				this._diffEnabled = !this._diffEnabled;
				this._doToggleDiff();
			}
		}));
	}

	override dispose(): void {
		this._diffDecorations.clear();
		this._store.dispose();
	}

	protected _doToggleDiff(): void {
		this._diffDecorations.visible = this._diffEnabled;
	}

	async apply() {
		if (this._editCount > 0) {
			this._editor.pushUndoStop();
		}
		this._diffDecorations.clear();
	}

	async cancel() {
		const { textModelN: modelN, textModelNAltVersion, textModelNSnapshotAltVersion } = this._models;
		if (modelN.isDisposed()) {
			return;
		}
		const targetAltVersion = textModelNSnapshotAltVersion ?? textModelNAltVersion;
		LiveStrategy._undoModelUntil(modelN, targetAltVersion);
		this._diffDecorations.clear();
	}

	override async makeChanges(edits: ISingleEditOperation[]): Promise<void> {
		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
			// Scroll to the location of the first edit
			const firstEditRange = edits[0].range;
			const firstEditPosition: IPosition = {
				lineNumber: firstEditRange.startLineNumber,
				column: firstEditRange.startColumn
			};
			this._editor.revealPositionInCenter(firstEditPosition, ScrollType.Immediate);
		}
		this._editor.executeEdits('inline-chat-live', edits, this.cursorStateComputerAndInlineDiffCollection);
	}

	override async undoChanges(altVersionId: number): Promise<void> {
		const { textModelN } = this._models;
		LiveStrategy._undoModelUntil(textModelN, altVersionId);
	}

	override async makeProgressiveChanges(edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {
		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		const durationInSec = opts.duration / 1000;
		for (const edit of edits) {
			const wordCount = countWords(edit.text ?? '');
			const speed = wordCount / durationInSec;
			await performAsyncTextEdit(this._models.textModelN, asProgressiveEdit(edit, speed, opts.token), this.cursorStateComputerAndInlineDiffCollection);
		}
	}

	override async renderChanges() {
		// const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		// this._updateSummaryMessage(diff?.changes ?? []);
		this._diffDecorations.update();
	}

	private static _undoModelUntil(model: ITextModel, targetAltVersion: number): void {
		while (targetAltVersion < model.getAlternativeVersionId() && model.canUndo()) {
			model.undo();
		}
	}

	protected _updateSummaryMessage(mappings: readonly LineRangeMapping[]) {
		let linesChanged = 0;
		for (const change of mappings) {
			linesChanged += change.changedLineCount;
		}
		let message: string;
		if (linesChanged === 0) {
			message = localize('lines.0', "Nothing changed");
		} else if (linesChanged === 1) {
			message = localize('lines.1', "Changed 1 line");
		} else {
			message = localize('lines.N', "Changed {0} lines", linesChanged);
		}
		console.log(message);
		// this._widget.updateStatus(message);
	}

	private cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
		let last: Position | null = null;
		for (const edit of undoEdits) {
			last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
			this._diffDecorations.collectEditOperation(edit);
		}
		return last && [Selection.fromPositions(last)];
	};
}

export class CSChatEditsDiffDecorations {

	private readonly _collection: IEditorDecorationsCollection;

	private _data: { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions }[] = [];
	private _visible: boolean = false;

	constructor(editor: ICodeEditor, visible: boolean = false) {
		this._collection = editor.createDecorationsCollection();
		this._visible = visible;
	}

	get visible() {
		return this._visible;
	}

	set visible(value: boolean) {
		this._visible = value;
		this.update();
	}

	clear() {
		this._collection.clear();
		this._data.length = 0;
	}

	collectEditOperation(op: IValidEditOperation) {
		this._data.push(CSChatEditsDiffDecorations._asDecorationData(op));
	}

	update() {
		this._collection.set(this._data.map(d => {
			const res = { ...d.tracking };
			if (this._visible) {
				res.options = { ...res.options, ...d.decorating };
			}
			return res;
		}));
	}

	private static _asDecorationData(edit: IValidEditOperation): { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions } {
		const tracking: IModelDeltaDecoration = {
			range: edit.range,
			options: {
				description: 'cschat-edits-inline-diff',
			}
		};

		const decorating: IModelDecorationOptions = {
			description: 'cschat-edits-inline-diff',
			className: !edit.range.isEmpty() ? 'cschat-edits-lines-inserted-range' : undefined,
			showIfCollapsed: true,
		};

		return { tracking, decorating };
	}
}
