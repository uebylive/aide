/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { editorFindMatch, editorFindMatchForeground, selectionBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { AideProbeExplanationWidget } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanationWidget';
import { IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { probeDefinitionDecorationClass, probeDefinitionDecoration, editSymbolDecorationClass, editSymbolDecoration } from 'vs/workbench/contrib/aideProbe/browser/contrib/aideProbeDecorations';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const IAideProbeExplanationService = createDecorator<IAideProbeExplanationService>('IAideProbeExplanationService');

export interface IAideProbeExplanationService {
	_serviceBrand: undefined;

	changeActiveBreakdown(content: IAideProbeBreakdownViewModel): void;
	clear(): void;
}

export class AideProbeExplanationService extends Disposable implements IAideProbeExplanationService {
	declare _serviceBrand: undefined;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly markdownRenderer: MarkdownRenderer;
	private readonly resourceLabels: ResourceLabels;

	private explanationWidget: AideProbeExplanationWidget | undefined;
	private activeCodeEditor: ICodeEditor | undefined;

	constructor(
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this.markdownRenderer = this.instantiationService.createInstance(ChatMarkdownRenderer, undefined);
		this.resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeVisibility }));

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateDecorations()));
		this.updateRegisteredDecorationTypes();
	}

	private async openCodeEditor(uri: URI, selection?: IRange): Promise<ICodeEditor | null> {
		const editor = await this.codeEditorService.openCodeEditor({
			resource: uri,
			options: { pinned: false, preserveFocus: true }
		}, null);

		if (editor && selection) {
			editor.revealLineNearTop(selection.startLineNumber || 1, ScrollType.Smooth);
		}

		return editor;
	}

	async changeActiveBreakdown(element: IAideProbeBreakdownViewModel): Promise<void> {
		const { uri } = element;
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();

		let codeEditor: ICodeEditor | null;
		let breakdownPosition: Position = new Position(1, 300);

		const symbol = await element.symbol;
		if (!symbol) {
			codeEditor = await this.openCodeEditor(uri);
		} else {
			breakdownPosition = new Position(symbol.range.startLineNumber - 1, symbol.range.startColumn);
			codeEditor = await this.openCodeEditor(uri, symbol.range);
		}

		if (codeEditor && symbol && breakdownPosition) {
			this.explanationWidget = this._register(this.instantiationService.createInstance(
				AideProbeExplanationWidget, codeEditor, this.resourceLabels, this.markdownRenderer
			));
			await this.explanationWidget.setBreakdown(element);
			this.explanationWidget.show();
			this.explanationWidget.showProbingSymbols(symbol);
		}
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(probeDefinitionDecorationClass);
		this.codeEditorService.removeDecorationType(editSymbolDecorationClass);

		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(probeDefinitionDecorationClass, probeDefinitionDecoration, {
			color: theme.getColor(editorFindMatchForeground)?.toString(),
			backgroundColor: theme.getColor(editorFindMatch)?.toString(),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(editSymbolDecorationClass, editSymbolDecoration, {
			backgroundColor: theme.getColor(selectionBackground)?.toString(),
			isWholeLine: true
		});

		this.updateDecorations();
	}

	private updateDecorations() {
		this.activeCodeEditor?.removeDecorationsByType(probeDefinitionDecoration);
		const activeSession = this.aideProbeService.getSession();
		if (!activeSession) {
			return;
		}

		const activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor)) {
			this.activeCodeEditor = activeEditor;
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


			const matchingCodeEdits = activeSession.response?.codeEdits.filter(edit => edit.reference.uri.fsPath === uri.fsPath) ?? [];
			for (const codeEdit of matchingCodeEdits) {
				for (const singleEdit of codeEdit.edits) {
					activeEditor.setDecorationsByType(editSymbolDecorationClass, editSymbolDecoration, [
						{
							range: {
								...singleEdit.range,
								endColumn: singleEdit.range.endColumn + 1
							},
						}
					]);
				}
			}
		}



	}

	clear(): void {
		this.explanationWidget?.clear();
		this.explanationWidget?.hide();
		this.explanationWidget?.dispose();
		this.updateDecorations();
	}
}
