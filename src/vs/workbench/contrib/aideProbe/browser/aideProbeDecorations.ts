/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { CancellationToken } from 'vs/base/common/cancellation';
// import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
// import { themeColorFromId } from 'vs/base/common/themables';
// import { URI } from 'vs/base/common/uri';
// import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
// import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
// import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
// import { MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
// import { MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
// import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ICSEventsService } from 'vs/editor/common/services/csEvents';
// import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { calculateChanges } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPalettePanel';
// import { IAideProbeEdits } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
// import { IAideProbeUndoEditEvent } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
// import { IAideProbeBreakdownContent, IAideProbeCompleteEditEvent, IAideProbeGoToDefinition, IAideProbeReviewUserEvent, IAideProbeUndoEditEvent } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { IAideProbeReviewUserEvent } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { HunkInformation } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
// import { HunkState, HunkInformation } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
// import { overviewRulerInlineChatDiffInserted, minimapInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

// const editDecorationOptions = ModelDecorationOptions.register({
// 	description: 'aide-probe-edit-modified',
// 	className: 'inline-chat-inserted-range',
// 	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
// });

// const editLineDecorationOptions = ModelDecorationOptions.register({
// 	description: 'aide-probe-edit-modified-line',
// 	className: 'inline-chat-inserted-range-linehighlight',
// 	isWholeLine: true,
// 	overviewRuler: {
// 		position: OverviewRulerLane.Full,
// 		color: themeColorFromId(overviewRulerInlineChatDiffInserted),
// 	},
// 	minimap: {
// 		position: MinimapPosition.Inline,
// 		color: themeColorFromId(minimapInlineChatDiffInserted),
// 	}
// });

// const breakdownDecorationOptions = ModelDecorationOptions.register({
// 	description: 'aide-probe-breakdown',
// 	className: 'aide-probe-breakdown',
// 	isWholeLine: true,
// });

// const goToDefinitionDecorationOptions = ModelDecorationOptions.register({
// 	description: 'aide-probe-go-to-definition',
// 	className: 'aide-probe-go-to-definition'
// });

type HunkDisplayData = {
	decorationIds: string[];
	hunk: HunkInformation;
	position: Position;
	remove(): void;
};

export class AideProbeDecorationService extends Disposable {
	static readonly ID = 'workbench.contrib.aideProbeDecorationService';

	private readonly _hunkDisplayData = new Map<HunkInformation, HunkDisplayData>();
	private breakdownDecorations: Map<string, IEditorDecorationsCollection> = new Map();
	private goToDefinitionDecorations: Map<string, IEditorDecorationsCollection> = new Map();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		// @ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		// @IOutlineModelService private readonly outlineModelService: IOutlineModelService,
		@ICSEventsService private readonly csEventsService: ICSEventsService
	) {
		super();

		this._register(this.aideProbeService.onNewEvent((event) => {
			if (event.kind === 'completeEdit') {
				// this.handleEditCompleteEvent(event);
			} else if (event.kind === 'undoEdit') {
				// this.handleUndoEditEvent(event);
			} else if (event.kind === 'goToDefinition') {
				// this.handleGoToDefinitionEvent(event);
			} else if (event.kind === 'breakdown') {
				// this.handleBreakdownEvent(event);
			} else if (event.kind === 'discardAll') {
				this.discardAllDecorations();
			}
		}));
		this._register(this.aideProbeService.onReview(e => {
			this.removeDecorations(e);
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => {
			const activeEditor = this.editorService.activeTextEditorControl;
			if (isCodeEditor(activeEditor)) {
				const uri = activeEditor.getModel()?.uri;
				const currentSession = this.aideProbeService.getSession();
				if (!uri || !currentSession) {
					return;
				}

				// const allEdits = currentSession.response?.codeEdits;
				// const fileEdits = allEdits?.get(uri.toString());
				// if (fileEdits) {
				// 	this.updateDecorations(activeEditor, fileEdits);
				// }
			}
		}));
	}

	// private async getCodeEditor(resource: URI, dontOpen?: boolean): Promise<ICodeEditor | null> {
	// 	const openEditor = this.codeEditorService.listCodeEditors().find(editor => editor.getModel()?.uri.toString() === resource.toString());
	// 	if (openEditor) {
	// 		return openEditor;
	// 	} else if (dontOpen) {
	// 		return null;
	// 	}

	// 	return await this.codeEditorService.openCodeEditor({ resource, options: { preserveFocus: true } }, null);
	// }

	// private async handleEditCompleteEvent(event: IAideProbeCompleteEditEvent) {
	// 	const currentSession = this.aideProbeService.getSession();
	// 	if (!currentSession) {
	// 		return;
	// 	}

	// 	const allEdits = currentSession.response?.codeEdits;
	// 	const fileEdits = allEdits?.get(event.resource.toString());
	// 	if (!fileEdits) {
	// 		return;
	// 	}

	// 	const { resource } = event;
	// 	const editor = await this.getCodeEditor(resource);
	// 	if (editor) {
	// 		this.updateDecorations(editor, fileEdits);
	// 	}
	// }

	// private async handleUndoEditEvent(event: IAideProbeUndoEditEvent) {
	// 	const currentSession = this.aideProbeService.getSession();
	// 	if (!currentSession) {
	// 		return;
	// 	}

	// 	const { resource, changes } = event;
	// 	const allEdits = currentSession.response?.codeEdits;
	// 	const fileEdits = allEdits?.get(resource.toString());
	// 	if (!fileEdits) {
	// 		return;
	// 	}

	// 	const editor = await this.getCodeEditor(resource);
	// 	if (!editor) {
	// 		return;
	// 	}

	// 	editor.changeDecorations(decorationsAccessor => {
	// 		for (const change of changes) {
	// 			const changeRange = change.range;
	// 			// Remove the corresponding hunk from hunkData
	// 			const hunkData = fileEdits.hunkData.getInfo().find(hunk => hunk.getRangesN().some(range => range.equalsRange(changeRange)));
	// 			if (hunkData) {
	// 				const data = this._hunkDisplayData.get(hunkData);
	// 				if (data) {
	// 					this._hunkDisplayData.delete(hunkData);
	// 					data.remove();
	// 				}
	// 				hunkData.discardChanges();
	// 			}

	// 			// Remove all decorations that intersect with the range of the change
	// 			const intersected = editor.getDecorationsInRange(Range.lift(changeRange));
	// 			for (const decoration of intersected ?? []) {
	// 				decorationsAccessor.removeDecoration(decoration.id);
	// 			}
	// 		}
	// 	});
	// }

	// private updateDecorations(editor: ICodeEditor, fileEdits: IAideProbeEdits) {
	// 	editor.changeDecorations(decorationsAccessor => {
	// 		const keysNow = new Set(this._hunkDisplayData.keys());

	// 		for (const hunkData of fileEdits.hunkData.getInfo()) {
	// 			keysNow.delete(hunkData);

	// 			const hunkRanges = hunkData.getRangesN();
	// 			let data = this._hunkDisplayData.get(hunkData);
	// 			if (!data) {
	// 				const decorationIds: string[] = [];
	// 				for (let i = 0; i < hunkRanges.length; i++) {
	// 					decorationIds.push(decorationsAccessor.addDecoration(hunkRanges[i], i === 0
	// 						? editLineDecorationOptions
	// 						: editDecorationOptions
	// 					));
	// 				}

	// 				const remove = () => {
	// 					editor.changeDecorations(decorationsAccessor => {
	// 						if (data) {
	// 							for (const decorationId of data.decorationIds) {
	// 								decorationsAccessor.removeDecoration(decorationId);
	// 							}
	// 							data.decorationIds = [];
	// 						}
	// 					});
	// 				};

	// 				data = {
	// 					decorationIds,
	// 					hunk: hunkData,
	// 					position: hunkRanges[0].getStartPosition().delta(-1),
	// 					remove
	// 				};
	// 				this._hunkDisplayData.set(hunkData, data);
	// 			} else if (hunkData.getState() !== HunkState.Pending) {
	// 				data.remove();
	// 			} else {
	// 				const modifiedRangeNow = hunkRanges[0];
	// 				data.position = modifiedRangeNow.getStartPosition().delta(-1);
	// 			}
	// 		}

	// 		for (const key of keysNow) {
	// 			const data = this._hunkDisplayData.get(key);
	// 			if (data) {
	// 				this._hunkDisplayData.delete(key);
	// 				data.remove();
	// 			}
	// 		}
	// 	});
	// }

	private removeDecorations(e: IAideProbeReviewUserEvent) {
		// Calculate the number of changes being accepted
		const edits = Array.from(this._hunkDisplayData.keys());
		const changes = calculateChanges(edits);
		this.csEventsService.reportAgentCodeEdit({ accepted: e === 'accept', ...changes });

		// Remove all decorations
		this.discardAllDecorations();
	}

	private discardAllDecorations() {
		for (const data of this._hunkDisplayData.values()) {
			data.remove();
		}
		for (const decorations of this.breakdownDecorations.values()) {
			decorations.clear();
		}
		for (const decorations of this.goToDefinitionDecorations.values()) {
			decorations.clear();
		}
	}

	// private async handleBreakdownEvent(event: IAideProbeBreakdownContent) {
	// 	const currentSession = this.aideProbeService.getSession();
	// 	if (!currentSession) {
	// 		return;
	// 	}

	// 	const editor = await this.getCodeEditor(event.reference.uri, true);
	// 	const textModel = editor?.getModel();
	// 	if (!editor || !textModel) {
	// 		return;
	// 	}

	// 	const { reference } = event;
	// 	const symbols = (await this.outlineModelService.getOrCreate(textModel, CancellationToken.None)).getTopLevelSymbols();
	// 	const symbol = symbols.find(s => s.name === reference.name);
	// 	if (!symbol) {
	// 		return;
	// 	}

	// 	let progressiveBreakdownDecorations = this.breakdownDecorations.get(reference.uri.toString());
	// 	if (!progressiveBreakdownDecorations) {
	// 		this.breakdownDecorations.set(reference.uri.toString(), editor.createDecorationsCollection());
	// 		progressiveBreakdownDecorations = this.breakdownDecorations.get(reference.uri.toString());
	// 	}

	// 	const existingDecorations = progressiveBreakdownDecorations?.getRanges();
	// 	if (existingDecorations?.some(decoration => decoration.intersectRanges(symbol.range))) {
	// 		return;
	// 	}

	// 	const newDecoration: IModelDeltaDecoration = {
	// 		range: symbol.range,
	// 		options: breakdownDecorationOptions
	// 	};
	// 	progressiveBreakdownDecorations?.append([newDecoration]);
	// }

	// private async handleGoToDefinitionEvent(event: IAideProbeGoToDefinition) {
	// 	const { uri: resource } = event;
	// 	let progressiveGTDDecorations = this.goToDefinitionDecorations.get(resource.toString());
	// 	if (!progressiveGTDDecorations) {
	// 		const editor = await this.getCodeEditor(resource);
	// 		if (editor && !this.goToDefinitionDecorations.has(resource.toString())) {
	// 			this.goToDefinitionDecorations.set(resource.toString(), editor.createDecorationsCollection());
	// 		}
	// 		progressiveGTDDecorations = this.goToDefinitionDecorations.get(resource.toString());
	// 	}

	// 	const newDecoration: IModelDeltaDecoration = {
	// 		range: event.range,
	// 		options: {
	// 			...goToDefinitionDecorationOptions,
	// 			hoverMessage: new MarkdownString(event.thinking),
	// 		}
	// 	};
	// 	progressiveGTDDecorations?.append([newDecoration]);
	// }
}
