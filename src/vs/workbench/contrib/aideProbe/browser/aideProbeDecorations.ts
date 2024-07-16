/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { IAideProbeEditEvent, IAideProbeGoToDefinition } from 'vs/workbench/contrib/aideProbe/common/aideProbe';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

const editDecorationOptions = ModelDecorationOptions.register({
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

export class AideProbeDecorationService extends Disposable {
	static readonly ID = 'workbench.contrib.aideProbeDecorationService';

	private goToDefinitionDecorations: Map<string, IEditorDecorationsCollection> = new Map();
	private editDecorations: Map<string, IEditorDecorationsCollection> = new Map();

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
	) {
		super();

		this._register(this.aideProbeService.onNewEvent((event) => {
			if (event.kind === 'edit') {
				this.handleEditEvent(event);
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

	private async handleEditEvent(event: IAideProbeEditEvent) {
		const { edits, resource } = event;
		let progressiveEditingDecorations = this.editDecorations.get(resource.toString());
		if (!progressiveEditingDecorations) {
			const editor = await this.codeEditorService.openCodeEditor({ resource }, null);
			if (editor && !this.editDecorations.has(resource.toString())) {
				this.editDecorations.set(resource.toString(), editor.createDecorationsCollection());
			}
			progressiveEditingDecorations = this.editDecorations.get(resource.toString());
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
			newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: editDecorationOptions });
		}

		progressiveEditingDecorations!.append(newDecorations);
	}


	private removeDecorations() {
		this.editDecorations.clear();
	}

	/*
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
