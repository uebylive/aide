/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { themeColorFromId } from 'vs/base/common/themables';
import { assertType } from 'vs/base/common/types';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { IAideProbeCompleteEditEvent, IAideProbeGoToDefinition } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { HunkInformation, HunkState } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

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

const goToDefinitionDecorationOptions = ModelDecorationOptions.register({
	description: 'aide-probe-go-to-definition',
	className: 'aide-probe-go-to-definition'
});

type HunkDisplayData = {
	decorationIds: string[];
	hunk: HunkInformation;
	position: Position;
	remove(): void;
};

export class AideProbeDecorationService extends Disposable {
	static readonly ID = 'workbench.contrib.aideProbeDecorationService';

	private readonly _hunkDisplayData = new Map<HunkInformation, HunkDisplayData>();
	private goToDefinitionDecorations: Map<string, IEditorDecorationsCollection> = new Map();

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
	) {
		super();

		this._register(this.aideProbeService.onNewEvent((event) => {
			if (event.kind === 'completeEdit') {
				this.handleEditCompleteEvent(event);
			} else if (event.kind === 'goToDefinition') {
				this.handleGoToDefinitionEvent(event);
			}
		}));

		this._register(this.aideProbeService.onReview(() => {
			this.removeDecorations();
		}));

		/*
		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateDecorations()));
		this.updateRegisteredDecorationTypes();
		*/
	}

	private async handleEditCompleteEvent(event: IAideProbeCompleteEditEvent) {
		const currentSession = this.aideProbeService.getSession();
		if (!currentSession) {
			return;
		}

		const allEdits = currentSession.response?.codeEdits;
		const fileEdits = allEdits?.get(event.resource.toString());
		if (!fileEdits) {
			return;
		}

		const { resource } = event;
		const editor = await this.codeEditorService.openCodeEditor({ resource }, null);

		editor?.changeDecorations(decorationsAccessor => {
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
							assertType(data);
							for (const decorationId of data.decorationIds) {
								decorationsAccessor.removeDecoration(decorationId);
							}
							data.decorationIds = [];
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


	private removeDecorations() {
		// for (const decorations of this.editDecorations.values()) {
		// 	decorations.clear();
		// }
	}

	/*
	private async handleEditStartEvent(event: IAideProbeStartEditEvent) {
		const { edits, resource } = event;
		let progressiveEditingDecorations = this.progressiveEditingDecorations.get(resource.toString());
		if (!progressiveEditingDecorations) {
			const editor = await this.codeEditorService.openCodeEditor({ resource }, null);
			if (editor && !this.progressiveEditingDecorations.has(resource.toString())) {
				this.progressiveEditingDecorations.set(resource.toString(), editor.createDecorationsCollection());
			}
			progressiveEditingDecorations = this.progressiveEditingDecorations.get(resource.toString());
		}

		const newLines = new Set<number>();
		for (const edit of edits) {
			LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
		}
		const existingRanges = progressiveEditingDecorations!.getRanges().map(LineRange.fromRange);
		for (const existingRange of existingRanges) {
			existingRange.forEach(line => newLines.delete(line));
		}
		const newDecorations: IModelDeltaDecoration[] = [];
		for (const line of newLines) {
			newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: editLineDecorationOptions });
		}

		progressiveEditingDecorations!.append(newDecorations);
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(probeDefinitionDecorationClass);

		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(probeDefinitionDecorationClass, probeDefinitionDecoration, {
			color: theme.getColor(editorFindMatchForeground)?.toString(),
			backgroundColor: theme.getColor(editorFindMatch)?.toString(),
			borderRadius: '3px'
		});

		this.updateDecorations();
	}

	private updateDecorations() {
		if (this.activeEditor) {
			this.activeEditor.removeDecorationsByType(probeDefinitionDecoration);
		}

		const activeSession = this.aideProbeService.getSession();
		if (!activeSession) {
			return;
		}

		const activeEditor = this.editorService.activeTextEditorControl;

		if (isCodeEditor(activeEditor)) {
			this.activeEditor = activeEditor;
			const uri = activeEditor.getModel()?.uri;
			if (!uri) {
				return;
			}

			const matchingDefinitions = activeSession.response?.goToDefinitions.filter(definition => definition.uri.fsPath === uri.fsPath) ?? [];
			for (const decoration of matchingDefinitions) {
				activeEditor.setDecorationsByType(probeDefinitionDecorationClass, probeDefinitionDecoration, [
					{
						range: {
							...decoration.range,
							endColumn: decoration.range.endColumn + 1
						},
						hoverMessage: new MarkdownString(decoration.thinking),
					}
				]);
			}
		}
	}
	*/

	private async handleGoToDefinitionEvent(event: IAideProbeGoToDefinition) {
		const { uri: resource } = event;
		let progressiveGTDDecorations = this.goToDefinitionDecorations.get(resource.toString());
		if (!progressiveGTDDecorations) {
			const editor = await this.codeEditorService.openCodeEditor({ resource }, null);
			if (editor && !this.goToDefinitionDecorations.has(resource.toString())) {
				this.goToDefinitionDecorations.set(resource.toString(), editor.createDecorationsCollection());
			}
			progressiveGTDDecorations = this.goToDefinitionDecorations.get(resource.toString());
		}

		const newDecoration: IModelDeltaDecoration = {
			range: event.range,
			options: {
				...goToDefinitionDecorationOptions,
				hoverMessage: new MarkdownString(event.thinking),
			}
		};
		progressiveGTDDecorations?.append([newDecoration]);
	}
}
