/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IWorkspaceTextEdit } from '../../../../editor/common/languages.js';
import { ITextModel, ITextSnapshot, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot, ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DefaultModelSHA1Computer } from '../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelContentChange } from '../../../../editor/common/textModelEvents.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from '../../inlineChat/common/inlineChat.js';
import { IAideAgentCodeEditingService, IAideAgentCodeEditingSession } from '../common/aideAgentCodeEditingService.js';
import { HunkData, HunkDisplayData, HunkInformation, HunkState } from '../common/aideAgentEditingSession.js';
import { IAideAgentEdits, IChatTextEditGroupState } from '../common/aideAgentModel.js';



const editDecorationOptions = ModelDecorationOptions.register({
	description: 'aide-probe-edit-modified',
	className: 'inline-chat-inserted-range',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
});

const editLineDecorationOptions = ModelDecorationOptions.register({
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

interface TextModelSnapshotUntilPoint {
	resourceName: string;
	// refernece here reports to the reference we want to store because we might
	// revisit it later
	// we have to be careful to discard all of this very quickly otherwise the memory
	// grows quite a bit
	reference: string;
	textModel: ITextSnapshot;
}

/**
 * Filter by the refernece:
 * we check for the prefix: `plan_` or `step_` and then try to compare them together
 * from there on as `plan_{idx}` and just grab the idx and sort by idx and grab the ones
 * which are greater than or equal to the idx which we have
 */
function filterGreaterThanOrEqualToReference(
	textModels: TextModelSnapshotUntilPoint[],
	filterStr: string
): Map<string, TextModelSnapshotUntilPoint[]> {
	const validPrefixes = ['plan_', 'step_'];
	let filterIndex = NaN;

	// Extract the index from filterStr if it starts with a valid prefix
	for (const prefix of validPrefixes) {
		if (filterStr.startsWith(prefix)) {
			const indexStr = filterStr.slice(prefix.length);
			filterIndex = parseInt(indexStr, 10);
			if (isNaN(filterIndex)) {
				// If the index part is not a valid number, return an empty Map
				return new Map();
			}
			break;
		}
	}

	if (isNaN(filterIndex)) {
		// If filterStr doesn't start with 'plan_' or 'step_', return an empty Map
		return new Map();
	}

	// Create a Map to hold the results
	const resultMap = new Map<string, TextModelSnapshotUntilPoint[]>();

	// Filter and group the textModels array
	for (const model of textModels) {
		const { resourceName, reference } = model;
		let index = NaN;

		// Check if reference starts with a valid prefix and extract the index
		for (const prefix of validPrefixes) {
			if (reference.startsWith(prefix)) {
				const indexStr = reference.slice(prefix.length);
				index = parseInt(indexStr, 10);
				break;
			}
		}

		// Include the model if the index is valid and greater than or equal to filterIndex
		if (!isNaN(index) && index >= filterIndex) {
			// Get the array for this resourceName from the Map, or create it if it doesn't exist
			if (!resultMap.has(resourceName)) {
				resultMap.set(resourceName, []);
			}
			resultMap.get(resourceName)!.push(model);
		}
	}

	// Sort the edits in each resourceName group by the numerical index
	const sortedMap = new Map();
	for (const [resourceName, edits] of resultMap) {
		const sortedEdits = edits.sort((a, b) => {
			let indexA = NaN;
			let indexB = NaN;
			for (const prefix of validPrefixes) {
				if (a.reference.startsWith(prefix)) {
					indexA = parseInt(a.reference.slice(prefix.length), 10);
				}
				if (b.reference.startsWith(prefix)) {
					indexB = parseInt(b.reference.slice(prefix.length), 10);
				}
			}
			if (isNaN(indexA) || isNaN(indexB)) {
				return 0;
			}
			return indexA - indexB;
		});
		sortedMap.set(resourceName, sortedEdits);
	}

	return sortedMap;
}


class AideAgentCodeEditingSession extends Disposable implements IAideAgentCodeEditingSession {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private activeEditor: ICodeEditor | undefined;

	// we are mapping out the hunk information with the hunk display data over here
	// each hunk will have a single hunk display data, this does not imply from the
	// data type that the ranges will not  be repeated in the hunks which is the major
	// concern right now
	private readonly _hunkDisplayData = new Map<HunkInformation, HunkDisplayData>();
	private readonly _progressiveEditsQueue = this._register(new Queue());
	private readonly _codeEdits = new Map<string, IAideAgentEdits>();
	private readonly _workingSet = new Set<string>();
	// keeps track of the snapshots until a point
	private _textModelSnapshotUntilPoint: TextModelSnapshotUntilPoint[] = [];

	constructor(
		readonly exchangeId: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		console.log('AideAgentCodeEditingSession::created', exchangeId);
		super();

		this.registerActiveEditor();
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.registerActiveEditor();
		}));
	}

	/**
	 * We try to show the decorations for the active window anytime we change
	 * the active window and changes have happened on the file
	 */
	private registerActiveEditor() {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor)) {
			this.activeEditor = activeEditor;
			const uri = activeEditor.getModel()?.uri;
			if (uri && this._workingSet.has(uri.toString())) {
				const resourceEdits = this._codeEdits.get(uri.toString())!;
				this.updateDecorations(activeEditor, resourceEdits);
			}
		}
	}

	private updateDecorations(editor: ICodeEditor, fileEdits: IAideAgentEdits) {
		// we might have too many decorations showing up over here, we have to be
		// careful about which decorations we keep around and which we reject and remove
		editor.changeDecorations(decorationsAccessor => {
			const keysNow = new Set(this._hunkDisplayData.keys());
			for (const hunkData of fileEdits.hunkData.getInfo()) {
				console.log('fileEdits::hunkInformaiton');
				keysNow.delete(hunkData);

				const hunkRanges = hunkData.getRangesN();
				let data = this._hunkDisplayData.get(hunkData);
				if (!data) {
					const decorationIds: string[] = [];
					for (let i = 0; i < hunkRanges.length; i++) {
						decorationIds.push(decorationsAccessor.addDecoration(hunkRanges[i], i === 0
							? editLineDecorationOptions
							: editDecorationOptions
						));
					}

					const remove = () => {
						editor.changeDecorations(decorationsAccessor => {
							if (data) {
								for (const decorationId of data.decorationIds) {
									decorationsAccessor.removeDecoration(decorationId);
								}
								data.decorationIds = [];
							}
						});
					};

					data = {
						decorationIds,
						hunk: hunkData,
						position: hunkRanges[0].getStartPosition().delta(-1),
						remove
					};
					this._hunkDisplayData.set(hunkData, data);
				} else if (hunkData.getState() !== HunkState.Pending) {
					data.remove();
				} else {
					// should we not remove the data from before if we have it and redo the decorations
					// or do we really want to keep them around?? looks and feels weird to me
					data.remove();
					// ?? what are we doing over here
					const modifiedRangeNow = hunkRanges[0];
					data.position = modifiedRangeNow.getStartPosition().delta(-1);
				}
			}

			for (const key of keysNow) {
				const data = this._hunkDisplayData.get(key);
				if (data) {
					this._hunkDisplayData.delete(key);
					data.remove();
				}
			}
		});
	}

	async apply(codeEdit: IWorkspaceTextEdit): Promise<void> {
		await this._progressiveEditsQueue.queue(async () => {
			await this.processWorkspaceEdit(codeEdit);
		});
	}

	private async processWorkspaceEdit(workspaceEdit: IWorkspaceTextEdit) {
		const workspaceLabel = workspaceEdit.metadata?.label;

		// the other thing which we want to try is that what happens when
		// we try to send an undo over here after we have a plan
		if (workspaceEdit.resource.fsPath === '/undoCheck') {
			const workspaceLabel = workspaceEdit.textEdit.text;
			// now find all the snapshots which we have at this point
			// and set them to the codeEdits value
			// find all the text models which are after the workspaceLabel
			// and remove all of them
			// so what we want to do this the following:
			// filter by any of the timestamp to be later than the undo one which we are sending
			// or compare the workspaceLabels somewhow using a comparator
			const filteredValues = filterGreaterThanOrEqualToReference(this._textModelSnapshotUntilPoint, workspaceLabel);
			filteredValues.forEach((filteredValues, resourceName) => {
				if (filteredValues.length === 0) {
					return;
				}
				const codeEdits = this._codeEdits.get(resourceName);
				codeEdits?.textModelN.setValue(filteredValues[0].textModel);
			});
			return;
		}

		// one possibility to solve this is to use this:
		// okay so we want to keep a snapshot for the text model as we are making
		// changes
		const resource = workspaceEdit.resource;
		const mapKey = resource.toString();
		// reset it back to nothing after we are done with it. pass through metadata
		// is a big hack but whatever rocks our boat
		workspaceEdit.metadata = undefined;
		// this is the version Id of the workspace edit we are interested in
		// when we start making changes we want to keep track of the version id
		// so we can figure out how far back we want to go

		let codeEdits: IAideAgentEdits;
		let firstEdit = false;
		if (this._codeEdits.has(mapKey)) {
			codeEdits = this._codeEdits.get(mapKey)!;
		} else {
			firstEdit = true;
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
				resource.with({ scheme: Schemas.vscode, authority: 'aide-agent-edits', path: '', query: new URLSearchParams({ id, 'textModel0': '' }).toString() }), true
			));

			codeEdits = {
				targetUri: resource.toString(),
				textModel0,
				textModelN,
				hunkData: this._register(new HunkData(this._editorWorkerService, textModel0, textModelN)),
			};
			this._codeEdits.set(mapKey, codeEdits);
			this._workingSet.add(resource.toString());
		}

		if (firstEdit) {
			codeEdits.textModelN.pushStackElement();
		}

		// Now first check if we have any entry which matches the metadata we are getting
		// passed if there is nothing then we can start by keeping track of the snapshot
		// which is textModelN over here
		const textModelAtSnapshot = this._textModelSnapshotUntilPoint.find((textModelSnapshot) => {
			return textModelSnapshot.resourceName === resource.toString() && textModelSnapshot.reference === workspaceLabel;
		});
		// this allows us to keep track of the text model at that reference location
		if (textModelAtSnapshot === undefined && workspaceLabel !== undefined) {
			this._textModelSnapshotUntilPoint.push({
				resourceName: resource.toString(),
				textModel: codeEdits.textModelN.createSnapshot(),
				reference: workspaceLabel,
			});
		}

		console.log('snapshots::stored', this._textModelSnapshotUntilPoint.length);

		codeEdits.hunkData.ignoreTextModelNChanges = true;
		codeEdits.textModelN.pushEditOperations(null, [workspaceEdit.textEdit], () => null);
		this._register(codeEdits.textModelN.onDidChangeContent(e => {
			if (e.isUndoing) {
				this.handleUndoEditEvent(resource, e.changes);
			}
		}));
		const { editState, diff } = await this.calculateDiff(codeEdits.textModel0, codeEdits.textModelN);
		await codeEdits.hunkData.recompute(editState, diff);
		codeEdits.hunkData.ignoreTextModelNChanges = false;

		if (this.activeEditor?.getModel()?.uri.toString() === resource.toString()) {
			this.updateDecorations(this.activeEditor, codeEdits);
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

	private async handleUndoEditEvent(resource: URI, changes: IModelContentChange[]) {
		const resourceEdits = this._codeEdits.get(resource.toString());
		if (!resourceEdits) {
			return;
		}

		if (!this.activeEditor || this.activeEditor.getModel()?.uri.toString() !== resource.toString()) {
			return;
		}

		this.activeEditor.changeDecorations(decorationsAccessor => {
			for (const change of changes) {
				const changeRange = change.range;
				// Remove the corresponding hunk from hunkData
				const hunkData = resourceEdits.hunkData.getInfo().find(hunk => hunk.getRangesN().some(range => range.equalsRange(changeRange)));
				if (hunkData) {
					const data = this._hunkDisplayData.get(hunkData);
					if (data) {
						this._hunkDisplayData.delete(hunkData);
						data.remove();
					}
					hunkData.discardChanges();
				}

				// Remove all decorations that intersect with the range of the change
				const intersected = this.activeEditor?.getDecorationsInRange(Range.lift(changeRange));
				for (const decoration of intersected ?? []) {
					decorationsAccessor.removeDecoration(decoration.id);
				}
			}
		});
	}

	complete(): void {
		const editedModels = new Set(Array.from(this._codeEdits.values()).map(edit => edit.textModelN));
		for (const model of editedModels) {
			model.pushStackElement();
		}
	}

	private removeDecorations() {
		for (const data of this._hunkDisplayData.values()) {
			data.remove();
		}
	}

	accept(): void {
		this.removeDecorations();
	}

	reject(): void {
		for (const edit of this._codeEdits.values()) {
			edit.hunkData.discardAll();
		}

		this.removeDecorations();
	}

	stop(): Promise<void> {
		throw new Error('Method not implemented.');
	}
}

export class AideAgentCodeEditingService extends Disposable implements IAideAgentCodeEditingService {
	_serviceBrand: undefined;

	private _sessions = new DisposableMap<string, IAideAgentCodeEditingSession>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	/**
	 * NOTE: exchangeId here is not really correct, this should be sessionId if we are working
	 * in the scope of a plan over here
	 */
	getOrStartCodeEditingSession(exchangeId: string): IAideAgentCodeEditingSession {
		if (this._sessions.get(exchangeId)) {
			return this._sessions.get(exchangeId)!;
		}

		const session = this.instantiationService.createInstance(AideAgentCodeEditingSession, exchangeId);
		this._sessions.set(exchangeId, session);
		return session;
	}
}
