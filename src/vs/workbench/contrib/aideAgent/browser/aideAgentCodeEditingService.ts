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
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
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
import { HunkData, HunkDisplayData, HunkInformation, HunkState, IAideAgentEdits, lineRangeAsRange, RawHunk } from '../common/aideAgentEditingSession.js';
import { IChatTextEditGroupState } from '../common/aideAgentModel.js';



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

interface TextModelSnapshotReference {
	response_idx: number;
	step_idx: number | null;
}

// Include the compareLabels function
function compareLabels(a: TextModelSnapshotReference, b: TextModelSnapshotReference): number {
	if (a.response_idx !== b.response_idx) {
		return a.response_idx - b.response_idx;
	}

	if (a.step_idx === null && b.step_idx === null) {
		return 0;
	} else if (a.step_idx === null) {
		return -1; // null step_idx comes before non-null
	} else if (b.step_idx === null) {
		return 1;
	} else {
		return a.step_idx - b.step_idx;
	}
}

// Include the findSnapshotAtOrBefore function
function findSnapshotAtOrBefore(snapshots: TextModelSnapshotUntilPoint[], reference: TextModelSnapshotReference): TextModelSnapshotUntilPoint | undefined {
	// Find the snapshot with the greatest label that is less than or equal to the reference
	let result: TextModelSnapshotUntilPoint | undefined = undefined;
	for (const snapshot of snapshots) {
		const snapshotLabel = parseLabel(snapshot.reference)!;
		if (compareLabels(snapshotLabel, reference) <= 0) {
			result = snapshot;
		} else {
			break;
		}
	}
	return result;
}

function parseLabel(label: string): TextModelSnapshotReference | null {
	const responsePrefix = 'response_';
	if (!label.startsWith(responsePrefix)) {
		return null;
	}

	const rest = label.slice(responsePrefix.length);

	let response_idx_str: string;
	let step_idx_str: string | null = null;

	const separator = '::';
	const separatorIndex = rest.indexOf(separator);

	if (separatorIndex !== -1) {
		response_idx_str = rest.slice(0, separatorIndex);
		step_idx_str = rest.slice(separatorIndex + separator.length);
	} else {
		response_idx_str = rest;
	}

	const response_idx = parseInt(response_idx_str, 10);
	if (isNaN(response_idx)) {
		return null;
	}

	let step_idx: number | null = null;
	if (step_idx_str !== null) {
		step_idx = parseInt(step_idx_str, 10);
		if (isNaN(step_idx)) {
			return null;
		}
	}

	return { response_idx, step_idx };
}

/**
 * Filter by the refernece:
 * The label looks like the following: response_{idx}::{step_idx}
 * Here we want to get access to the {idx} from response and from the step_idx as well
 * if possible. Both of these are necessary to figure out how far back we want to go
 * If we do not have a step_idx then its all good, if we do have a step_idx then we have to revert
 * back all the text models whose labels we have which are greater than or equal to the current {step_idx}
 */
function filterGreaterThanOrEqualToReference(
	textModels: TextModelSnapshotUntilPoint[],
	filterStr: string
): Map<string, TextModelSnapshotUntilPoint[]> {

	const filterReference = parseLabel(filterStr);
	if (!filterReference) {
		// Invalid filterStr format, return empty Map
		return new Map();
	}

	const { response_idx: filterResponseIdx, step_idx: filterStepIdx } = filterReference;

	// Create a Map to hold the results
	const resultMap = new Map<string, TextModelSnapshotUntilPoint[]>();

	// Filter and group the textModels array
	for (const model of textModels) {
		const { resourceName, reference } = model;
		const modelReference = parseLabel(reference);
		if (!modelReference) {
			continue; // Skip invalid references
		}

		const { response_idx: modelResponseIdx, step_idx: modelStepIdx } = modelReference;

		let includeModel = false;

		if (modelResponseIdx > filterResponseIdx) {
			includeModel = true;
		} else if (modelResponseIdx === filterResponseIdx) {
			if (filterStepIdx === null) {
				includeModel = true;
			} else if (modelStepIdx !== null && modelStepIdx >= filterStepIdx) {
				includeModel = true;
			}
		}

		if (includeModel) {
			if (!resultMap.has(resourceName)) {
				resultMap.set(resourceName, []);
			}
			resultMap.get(resourceName)!.push(model);
		}
	}

	// Sort the edits in each resourceName group
	for (const [_resourceName, edits] of resultMap) {
		edits.sort((a, b) => {
			const refA = parseLabel(a.reference);
			const refB = parseLabel(b.reference);

			if (!refA || !refB) {
				return 0;
			}

			// Compare by response_idx first
			if (refA.response_idx !== refB.response_idx) {
				return refA.response_idx - refB.response_idx;
			}

			// Then compare by step_idx
			if (refA.step_idx === null && refB.step_idx === null) {
				return 0;
			} else if (refA.step_idx === null) {
				return -1; // null step_idx comes before non-null
			} else if (refB.step_idx === null) {
				return 1;
			} else {
				return refA.step_idx - refB.step_idx;
			}
		});
	}

	return resultMap;
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

	get codeEdits() {
		return this._codeEdits;
	}

	constructor(
		readonly sessionId: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
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

	async editsBetweenExchangesInSession(sessionId: string, startExchangeId: string, nextExchangeId: string): Promise<Map<URI, Range[]>> {
		// Over here the assumption is that our exchanges are in the format we want them to be in
		// which is defined above for TextModelSnapshotReference
		// return the hunks we are interested in
		// here we do have the text models we want to figure out how to get the changed
		// hunks now, the hunks are driven because of the decorations ...
		// This can be in the following state:
		// - find all set of files from the start position which has their textModel0 representation (start from the startIndex -> endIndex)
		// - find the final set of files which are at the end position with their textModelN representation (start from the endIndex -> startIndex)
		// - compute the hunks using the editorService over here
		// - return the data
		if (this.sessionId !== sessionId) {
			return new Map();
		}

		const startReference = parseLabel(startExchangeId);
		const endReference = parseLabel(nextExchangeId);

		if (!startReference || !endReference) {
			// Invalid exchange IDs
			return new Map();
		}

		const resourceSnapshots = new Map<string, TextModelSnapshotUntilPoint[]>();
		for (const snapshot of this._textModelSnapshotUntilPoint) {
			const resourceName = snapshot.resourceName;
			if (!resourceSnapshots.has(resourceName)) {
				resourceSnapshots.set(resourceName, []);
			}
			resourceSnapshots.get(resourceName)!.push(snapshot);
		}

		const result = new Map<URI, Range[]>();

		for (const [resourceName, snapshots] of resourceSnapshots) {
			const snapshotsForResource = snapshots.filter(snap => parseLabel(snap.reference) !== null);
			// Sort the snapshots by label
			snapshotsForResource.sort((a, b) => {
				const labelA = parseLabel(a.reference)!;
				const labelB = parseLabel(b.reference)!;
				return compareLabels(labelA, labelB);
			});

			const codeEdits = this._codeEdits.get(resourceName);

			if (!codeEdits) {
				continue;
			}

			const snapshotStart = findSnapshotAtOrBefore(snapshotsForResource, startReference);
			const snapshotEnd = findSnapshotAtOrBefore(snapshotsForResource, endReference);

			if (!snapshotEnd || snapshotStart === snapshotEnd) {
				continue;
			}

			let snapshotStartSnapshot: ITextSnapshot;
			if (snapshotStart) {
				snapshotStartSnapshot = snapshotStart.textModel;
			} else {
				snapshotStartSnapshot = codeEdits.textModel0.createSnapshot();
			}

			const snapshotEndSnapshot = snapshotEnd.textModel;

			// Create temporary text models from snapshots
			const textBufferFactoryStart = createTextBufferFactoryFromSnapshot(snapshotStartSnapshot);
			const textBufferFactoryEnd = createTextBufferFactoryFromSnapshot(snapshotEndSnapshot);

			const uriStart = URI.parse(resourceName).with({ scheme: 'inmemory', fragment: 'start' });
			const uriEnd = URI.parse(resourceName).with({ scheme: 'inmemory', fragment: 'end' });

			const textModelStart = this._modelService.createModel(
				textBufferFactoryStart,
				null,
				uriStart,
				true
			);
			const textModelEnd = this._modelService.createModel(
				textBufferFactoryEnd,
				null,
				uriEnd,
				true
			);

			// Compute diff
			const diff = await this._editorWorkerService.computeDiff(textModelStart.uri, textModelEnd.uri, {
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: Number.MAX_SAFE_INTEGER,
				computeMoves: false,
			}, 'advanced');

			if (diff) {
				// merge changes neighboring changes
				const mergedChanges = [diff.changes[0]];
				for (let i = 1; i < diff.changes.length; i++) {
					const lastChange = mergedChanges[mergedChanges.length - 1];
					const thisChange = diff.changes[i];
					if (thisChange.modified.startLineNumber - lastChange.modified.endLineNumberExclusive <= HunkData._HUNK_THRESHOLD) {
						mergedChanges[mergedChanges.length - 1] = new DetailedLineRangeMapping(
							lastChange.original.join(thisChange.original),
							lastChange.modified.join(thisChange.modified),
							(lastChange.innerChanges ?? []).concat(thisChange.innerChanges ?? [])
						);
					} else {
						mergedChanges.push(thisChange);
					}
				}

				const hunks = mergedChanges.map(change => new RawHunk(change.original, change.modified, change.innerChanges ?? []));
				// add decorations to these textModels
				textModelEnd.changeDecorations(accessorN => {

					textModelStart.changeDecorations(accessor0 => {

						// this throws if we are writing more code than EOF
						try {

							// add new decorations
							for (const hunk of hunks) {

								const textModelNDecorations: string[] = [];
								const textModel0Decorations: string[] = [];

								textModelNDecorations.push(accessorN.addDecoration(lineRangeAsRange(hunk.modified, textModelEnd), HunkData._HUNK_TRACKED_RANGE));
								textModel0Decorations.push(accessor0.addDecoration(lineRangeAsRange(hunk.original, textModelStart), HunkData._HUNK_TRACKED_RANGE));

								for (const change of hunk.changes) {
									textModelNDecorations.push(accessorN.addDecoration(change.modifiedRange, HunkData._HUNK_TRACKED_RANGE));
									textModel0Decorations.push(accessor0.addDecoration(change.originalRange, HunkData._HUNK_TRACKED_RANGE));
								}
							}
						} catch (exception) {
							console.error(exception);
						}
					});
				});
			}

			// Now over here gather all the decoration ranges and then grab the ranges
			// for it
			const textModelEndRanges = textModelEnd.getAllDecorations().map((decoration) => {
				return decoration.range;
			});
			result.set(URI.parse(resourceName), textModelEndRanges);

			// Dispose the temporary models
			textModelStart.dispose();
			textModelEnd.dispose();
		}

		return result;
	}

	private async processWorkspaceEdit(workspaceEdit: IWorkspaceTextEdit) {
		// the workspace label which we get over here is of the form: response_{idx}::Option<{step_idx}>
		// we can use this as definitive markers to create an increasing order of preference for the ITextModel
		// which we want to keep in memory
		const workspaceLabel = workspaceEdit.metadata?.label;

		// the other thing which we want to try is that what happens when
		// we try to send an undo over here after we have a plan
		if (workspaceEdit.resource.fsPath === '/undoCheck' && workspaceLabel !== undefined) {
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
			const textModelSnapshotLabel = parseLabel(textModelSnapshot.reference);
			if (workspaceLabel === undefined) {
				return false;
			}
			const workspaceLabelParsed = parseLabel(workspaceLabel);
			return textModelSnapshot.resourceName === resource.toString() && textModelSnapshotLabel?.response_idx === workspaceLabelParsed?.response_idx && textModelSnapshotLabel?.step_idx === workspaceLabelParsed?.step_idx;
		});
		// this allows us to keep track of the text model at that reference location
		if (textModelAtSnapshot === undefined && workspaceLabel !== undefined) {
			this._textModelSnapshotUntilPoint.push({
				resourceName: resource.toString(),
				textModel: codeEdits.textModelN.createSnapshot(),
				reference: workspaceLabel,
			});
		}


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

	/**
	 * Accept today removes all decorations which are present on the editor
	 * ideally we want to keep the decorations around for the new changes but
	 * remove any for which we have acknowleged that we are okay
	 */
	accept(): void {
		this.removeDecorations();
	}

	reject(): void {
		for (const edit of this._codeEdits.values()) {
			edit.hunkData.discardAll();
		}

		this.removeDecorations();
	}

	/**
	 * Allows us to reject the changes for an exchange
	 * This in principle implies that when the edits have been made by an exchange
	 * clicking on Reject all implies that we are not happy with the edits made and
	 * want to change back
	 */
	async rejectForExchange(sessionId: string, exchangeId: string): Promise<void> {
		// now over here we want to very carefully revert the changes which have happened
		// because of the changes we made at a step, this is similar to a rollback
		// honestly
		// we use the same logic here of sending an undo request similar to what
		// we were doing before when talking from the extension layer
		if (this.sessionId !== sessionId) {
			return;
		}
		const workspaceEditForRevert: IWorkspaceTextEdit = {
			resource: URI.file('/undoCheck'),
			versionId: undefined,
			textEdit: {
				range: {
					endColumn: 0,
					endLineNumber: 0,
					startColumn: 0,
					startLineNumber: 0,
				},
				text: '',
			},
			metadata: {
				label: `${exchangeId}`,
				needsConfirmation: false,
			}
		};
		await this.processWorkspaceEdit(workspaceEditForRevert);
	}

	fileLocationForEditsMade(sessionId: string, exchangeId: string): Map<URI, Range[]> {
		if (sessionId !== this.sessionId) {
			return new Map();
		}
		const filteredTextModelReferences = this._textModelSnapshotUntilPoint.filter((textModelSnapshot) => {
			const textModelReference = parseLabel(textModelSnapshot.reference);
			const exchangeIdParsedReference = parseLabel(exchangeId);
			return textModelReference?.response_idx === exchangeIdParsedReference?.response_idx;
		});

		// we only show these locations when this is the last request, so we can use
		// the codeEdits map we have for getting the hunks which have been edited
		const resourceChangedLocations = new Map();
		for (const [resourceName, aideAgentEdits] of this._codeEdits) {
			if (filteredTextModelReferences.find((textModelReference) => {
				return textModelReference.resourceName === resourceName;
			}) !== undefined) {
				const hunkInformation = aideAgentEdits.hunkData.getInfo();
				const changedRanges = hunkInformation.map((hunkInfo) => {
					const allRanges = hunkInfo.getRangesN();
					// The first range is the whole hunk range after adjusting for gaps.
					return allRanges.length > 0 ? [allRanges[0]] : [];
				}).flat();
				resourceChangedLocations.set(URI.parse(resourceName), changedRanges);
			}
		}
		return resourceChangedLocations;
	}

	/**
	 * Returns the set of files which were changed during an exchange and additionally
	 * for the plan step we are interested in
	 */
	filesChangedForExchange(sessionId: string, exchangeId: string): URI[] {
		if (sessionId !== this.sessionId) {
			return [];
		}
		// we have a store for the edits made over here using the exchangeId as part of the input
		// so we can keep using that
		const filteredTextModelReferneces = this._textModelSnapshotUntilPoint.filter((textModelSnapshot) => {
			const textModelReference = parseLabel(textModelSnapshot.reference);
			const exchangeIdParsedReference = parseLabel(exchangeId);
			return textModelReference?.response_idx === exchangeIdParsedReference?.response_idx;
		});
		const fileNames = filteredTextModelReferneces.map((textModelReference) => {
			return URI.parse(textModelReference.resourceName);
		});
		return fileNames;
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

	doesExchangeHaveEdits(sessionId: string, exchangeId: string): boolean {
		const editingSession = this._sessions.get(sessionId);
		if (!editingSession) {
			return false;
		}
		const fileLocationWithEdits = editingSession.fileLocationForEditsMade(sessionId, exchangeId);
		// If the edits location is not empty, then we for sure have some edits
		return fileLocationWithEdits.size !== 0;
	}

	getOrStartCodeEditingSession(sessionId: string): IAideAgentCodeEditingSession {
		if (this._sessions.get(sessionId)) {
			return this._sessions.get(sessionId)!;
		}

		const session = this.instantiationService.createInstance(AideAgentCodeEditingSession, sessionId);
		this._sessions.set(sessionId, session);
		return session;
	}

	async editsBetweenExchanges(sessionId: string, startExchangeId: string, nextExchangeId: string): Promise<Map<URI, Range[]> | undefined> {
		const editingSession = this._sessions.get(sessionId);
		if (!editingSession) {
			return undefined;
		}
		const editedHunks = await editingSession.editsBetweenExchangesInSession(sessionId, startExchangeId, nextExchangeId);
		return editedHunks;
	}
}
