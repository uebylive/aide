/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { equals } from 'vs/base/common/objects';
import { themeColorFromId } from 'vs/base/common/themables';
import { generateUuid } from 'vs/base/common/uuid';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { IIdentifiedSingleEditOperation, IModelDeltaDecoration, ITextModel, IValidEditOperation, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot, ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Progress } from 'vs/platform/progress/common/progress';
import { IAideProbeBreakdownContent, IAideProbeGoToDefinition, IAideProbeModel, IAideProbeProgress, IAideProbeRequestModel, IAideProbeResponseModel, IAideProbeTextEdit, IAideProbeTextEditPreview } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { HunkData } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export class AideProbeRequestModel extends Disposable implements IAideProbeRequestModel {
	constructor(
		readonly sessionId: string,
		readonly message: string,
		readonly editMode: boolean
	) {
		super();
	}
}

export interface IAideProbeEdits {
	readonly targetUri: string;
	readonly textModel0: ITextModel;
	readonly textModelN: ITextModel;
	textModelNDecorations: IModelDeltaDecoration[];
	readonly hunkData: HunkData;
	readonly edits: IWorkspaceTextEdit[];
}

export class AideProbeResponseModel extends Disposable implements IAideProbeResponseModel {
	private _result: IMarkdownString | undefined;
	get result(): IMarkdownString | undefined {
		return this._result;
	}

	set result(value: IMarkdownString) {
		this._result = value;
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

	private readonly _codeEditsPreviewBySymbol: Map<string, IAideProbeTextEditPreview[]> = new Map();
	private readonly _codeEditsPreview: IAideProbeTextEditPreview[] = [];
	public get codeEditsPreview(): ReadonlyArray<IAideProbeTextEditPreview> {
		return this._codeEditsPreview;
	}

	private readonly _codeEdits: Map<string, IAideProbeEdits> = new Map();
	public get codeEdits(): ReadonlyMap<string, IAideProbeEdits | undefined> {
		return this._codeEdits;
	}

	private readonly _decoInsertedText = ModelDecorationOptions.register({
		description: 'aide-probe-edit-modified-line',
		className: 'inline-chat-inserted-range-linehighlight',
		isWholeLine: true,
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(overviewRulerInlineChatDiffInserted),
		},
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(minimapInlineChatDiffInserted),
		}
	});

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
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
	}

	applyGoToDefinition(goToDefinition: IAideProbeGoToDefinition) {
		const existing = this._goToDefinitions.find(gtd => equals(gtd.uri, goToDefinition.uri) && equals(gtd.name, goToDefinition.name));
		if (existing) {
			return;
		}

		this._goToDefinitions.push(goToDefinition);
	}

	applyCodeEditPreview(codeEditPreview: IAideProbeTextEditPreview) {
		const mapKey = `${codeEditPreview.reference.uri.toString()}:${codeEditPreview.reference.name}`;
		if (this._codeEditsPreviewBySymbol.has(mapKey)) {
			this._codeEditsPreviewBySymbol.get(mapKey)!.push(codeEditPreview);
		} else {
			this._codeEditsPreviewBySymbol.set(mapKey, [codeEditPreview]);
			this._codeEditsPreview.push(codeEditPreview);
		}
	}

	async applyCodeEdit(codeEdit: IAideProbeTextEdit) {
		for (const workspaceEdit of codeEdit.edits.edits) {
			if (ResourceTextEdit.is(workspaceEdit)) {
				const mapKey = `${workspaceEdit.resource.toString()}`;
				let codeEdits: IAideProbeEdits;
				if (this._codeEdits.has(mapKey)) {
					codeEdits = this._codeEdits.get(mapKey)!;
					codeEdits.edits.push(workspaceEdit);
				} else {
					const uri = workspaceEdit.resource;
					const textModel = this._modelService.getModel(uri);
					if (!textModel) {
						continue;
					}

					this._register((await this._textModelService.createModelReference(textModel.uri)));
					const textModelN = textModel;

					const id = generateUuid();
					const textModel0 = this._register(this._modelService.createModel(
						createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
						{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
						uri.with({ scheme: Schemas.vscode, authority: 'aide-probe-commandpalette', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
					));

					codeEdits = {
						targetUri: uri.toString(),
						textModel0,
						textModelN,
						textModelNDecorations: [],
						hunkData: this._register(new HunkData(this._editorWorkerService, textModel0, textModelN)),
						edits: [workspaceEdit]
					};
					this._codeEdits.set(mapKey, codeEdits);
				}

				const progress = new Progress<IValidEditOperation[]>(edits => {
					const newLines = new Set<number>();
					for (const edit of edits) {
						LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
					}

					const newDecorations: IModelDeltaDecoration[] = [];
					for (const line of newLines) {
						newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: this._decoInsertedText });
					}

					codeEdits.textModelNDecorations = newDecorations;
				});

				const editOperation: IIdentifiedSingleEditOperation = {
					range: workspaceEdit.textEdit.range,
					text: workspaceEdit.textEdit.text
				};

				codeEdits.hunkData.ignoreTextModelNChanges = true;
				codeEdits.textModelN.pushEditOperations(null, [editOperation], (undoEdits) => {
					progress.report(undoEdits);
					return null;
				});
				codeEdits.hunkData.ignoreTextModelNChanges = false;
			}
		}
	}

	revertEdits(): void {
		for (const { textModel0 } of this._codeEdits.values()) {
			const uri = textModel0.uri;
			const textModel = this._modelService.getModel(uri);
			if (textModel) {
				textModel.setValue(textModel0.getValue());
			}
		}
	}
}

export class AideProbeModel extends Disposable implements IAideProbeModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidChangeTailing = this._register(new Emitter<boolean>());
	readonly onDidChangeTailing = this._onDidChangeTailing.event;

	private _request: AideProbeRequestModel | undefined;
	private _response: AideProbeResponseModel | undefined;
	private _isComplete = false;
	private _isTailing = false;

	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get request(): IAideProbeRequestModel | undefined {
		return this._request;
	}

	get requestInProgress(): boolean {
		return !!this._request && !this._isComplete;
	}

	set request(value: AideProbeRequestModel) {
		this._request = value;
	}

	get response(): AideProbeResponseModel | undefined {
		return this._response;
	}

	get isComplete(): boolean {
		return this._isComplete;
	}

	get isTailing(): boolean {
		return this._isTailing;
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
		}

		switch (progress.kind) {
			case 'markdownContent':
				this._response.result = progress.content;
				break;
			case 'breakdown':
				this._response.applyBreakdown(progress);
				break;
			case 'goToDefinition':
				this._response.applyGoToDefinition(progress);
				break;
			case 'textEditPreview':
				this._response.applyCodeEditPreview(progress);
				break;
			case 'textEdit':
				await this._response.applyCodeEdit(progress);
				break;
		}

		this._onDidChange.fire();
	}

	completeResponse(): void {
		this._isComplete = true;
		this.followAlong(false);

		this._onDidChange.fire();
	}

	cancelRequest(): void {
		this._request = undefined;
		this._response = undefined;
		this._isComplete = false;

		this._onDidChange.fire();
	}

	followAlong(follow: boolean): void {
		this._isTailing = follow;

		this._onDidChangeTailing.fire(follow);
	}

	revertEdits(): void {
		this._response?.revertEdits();
	}
}
