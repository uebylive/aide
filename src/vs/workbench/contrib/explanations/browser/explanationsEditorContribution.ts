/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { GlyphMarginLane, IModelDecorationOptions, IModelDecorationsChangeAccessor, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import * as nls from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IExplanation, IExplanationUpdateData, IExplanationsEditorContribution, IExplanationsService } from 'vs/workbench/contrib/explanations/common/explanations';

interface IExplanationDecorations {
	decorationId: string;
	explanation: IExplanation;
	range: Range;
}

type ExplanationsForLine = { lineNumber: number; positions: IPosition[] };

const explanationIcon = registerIcon('explanation', Codicon.lightbulb, nls.localize('explanationIcon', 'Icon for the explanation decoration.'));

function createExplanationDecorations(model: ITextModel, explanations: ReadonlyArray<IExplanation>): { range: Range; options: IModelDecorationOptions }[] {
	const result: { range: Range; options: IModelDecorationOptions }[] = [];
	explanations.forEach((explanation) => {
		if (explanation.lineNumber > model.getLineCount()) {
			return;
		}
		const column = model.getLineFirstNonWhitespaceColumn(explanation.lineNumber);
		const range = model.validateRange(
			explanation.column ? new Range(explanation.lineNumber, explanation.column, explanation.lineNumber, explanation.column + 1)
				: new Range(explanation.lineNumber, column, explanation.lineNumber, column + 1)
		);

		result.push({
			options: getExplanationDecorationOptions(),
			range
		});
	});

	return result;
}

function getExplanationDecorationOptions(): IModelDecorationOptions {
	const options: IModelDecorationOptions = {
		description: 'explanation-decoration',
		glyphMargin: { position: GlyphMarginLane.Right },
		glyphMarginClassName: ThemeIcon.asClassName(explanationIcon),
		glyphMarginHoverMessage: new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: false }).appendText('test message'),
		before: {
			content: noBreakWhitespace,
			inlineClassName: `explanation-placeholder`,
			inlineClassNameAffectsLetterSpacing: true
		},
		zIndex: 9999
	};

	return options;
}

function createCandidateDecorations(model: ITextModel, explanationDecorations: IExplanationDecorations[], lineExplanations: ExplanationsForLine[]): { range: Range; options: IModelDecorationOptions; explanation: IExplanation | undefined }[] {
	const result: { range: Range; options: IModelDecorationOptions; explanation: IExplanation | undefined }[] = [];
	for (const { positions, lineNumber } of lineExplanations) {
		if (positions.length === 0) {
			continue;
		}

		// Do not render candidates if there is only one, since it is already covered by the line explanation
		const firstColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		const lastColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
		positions.forEach(p => {
			const range = new Range(p.lineNumber, p.column, p.lineNumber, p.column + 1);
			if ((p.column <= firstColumn && !explanationDecorations.some(en => en.range.startColumn > firstColumn && en.range.startLineNumber === p.lineNumber)) || p.column > lastColumn) {
				// Do not render candidates on the start of the line if there's no other breakpoint on the line.
				return;
			}

			const explanationAtPosition = explanationDecorations.find(end => end.range.equalsRange(range));
			result.push({
				range,
				options: {
					description: 'breakpoint-placeholder-decoration',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					before: explanationAtPosition ? undefined : {
						content: noBreakWhitespace,
						inlineClassName: `debug-breakpoint-placeholder`,
						inlineClassNameAffectsLetterSpacing: true
					},
				},
				explanation: explanationAtPosition ? explanationAtPosition.explanation : undefined
			});
		});
	}

	return result;
}

export class ExplanationsEditorContribution implements IExplanationsEditorContribution {

	private toDispose: IDisposable[] = [];
	private ignoreDecorationsChangedEvent = false;
	private explanationDecorations: IExplanationDecorations[] = [];
	private candidateDecorations: { decorationId: string }[] = [];
	private setDecorationsScheduler!: RunOnceScheduler;

	constructor(
		private readonly editor: ICodeEditor,
		@IExplanationsService private readonly explanationsService: IExplanationsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.setDecorationsScheduler = new RunOnceScheduler(() => this.setDecorations(), 30);
		this.setDecorationsScheduler.schedule();
		this.registerActions();
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			const model = this.editor.getModel();
			if (!e.target.position
				|| !model
				|| e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN
				|| e.target.detail.isAfterLines
			) {
				return;
			}

			const lineNumber = e.target.position.lineNumber;
			const uri = model.uri;

			this.explanationsService.addExplanation(
				uri, { lineNumber }
			);
		}));

		this.toDispose.push(this.explanationsService.getModel().onDidChangeExplanations(() => {
			if (!this.setDecorationsScheduler.isScheduled()) {
				this.setDecorationsScheduler.schedule();
			}
		}));
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.onModelDecorationsChanged()));
	}

	private registerActions(): void {
		const that = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'editor.action.addExplanation',
					title: nls.localize('addExplanation', "Add Explanation"),
					menu: {
						id: MenuId.EditorContext,
						group: 'navigation',
						order: 1.1
					}
				});
			}

			run(_: any, editor: ICodeEditor): void {
				const currentPosition = editor.getPosition();
				if (!currentPosition) {
					return;
				}

				const uri = editor.getModel()?.uri;
				if (!uri) {
					return;
				}

				that.explanationsService.addExplanation(
					uri,
					{
						lineNumber: currentPosition.lineNumber,
						column: currentPosition.column,
					}
				);
			}
		});
	}

	private async setDecorations(): Promise<void> {
		if (!this.editor.hasModel()) {
			return;
		}

		const setCandidateDecorations = (changeAccessor: IModelDecorationsChangeAccessor, desiredCandidatePositions: ExplanationsForLine[]) => {
			const desiredCandidateDecorations = createCandidateDecorations(model, this.explanationDecorations, desiredCandidatePositions);
			const candidateDecorationIds = changeAccessor.deltaDecorations(this.candidateDecorations.map(c => c.decorationId), desiredCandidateDecorations);
			this.candidateDecorations = candidateDecorationIds.map((decorationId, index) => {
				return {
					decorationId,
				};
			});
		};

		const activeCodeEditor = this.editor;
		const model = activeCodeEditor.getModel();
		const explanations = this.explanationsService.getModel().getExplanations();
		const desiredExplanationDecorations = this.instantiationService.invokeFunction(accessor => createExplanationDecorations(model, explanations));
		const desiredCandidatePositions: ExplanationsForLine[] = [];

		try {
			this.ignoreDecorationsChangedEvent = true;

			// Set explanation decorations
			activeCodeEditor.changeDecorations((changeAccessor) => {
				const decorationIds = changeAccessor.deltaDecorations(this.explanationDecorations.map(epd => epd.decorationId), desiredExplanationDecorations);
				this.explanationDecorations = decorationIds.map((decorationId, index) => {
					return {
						decorationId,
						explanation: explanations[index],
						range: desiredExplanationDecorations[index].range
					};
				});

				setCandidateDecorations(changeAccessor, desiredCandidatePositions);
			});
		} finally {
			this.ignoreDecorationsChangedEvent = false;
		}
	}

	private async onModelDecorationsChanged(): Promise<void> {
		if (this.explanationDecorations.length === 0 || this.ignoreDecorationsChangedEvent || !this.editor.hasModel()) {
			return;
		}
		let somethingChanged = false;
		const model = this.editor.getModel();
		this.explanationDecorations.forEach(explanationDecoration => {
			if (somethingChanged) {
				return;
			}
			const newExplanationRange = model.getDecorationRange(explanationDecoration.decorationId);
			if (newExplanationRange && (!explanationDecoration.range.equalsRange(newExplanationRange))) {
				somethingChanged = true;
				explanationDecoration.range = newExplanationRange;
			}
		});
		if (!somethingChanged) {
			return;
		}

		const data = new Map<string, IExplanationUpdateData>();
		for (let i = 0, len = this.explanationDecorations.length; i < len; i++) {
			const explanationDecoration = this.explanationDecorations[i];
			const decorationRange = model.getDecorationRange(explanationDecoration.decorationId);
			// check if the line got deleted.
			if (decorationRange) {
				// since we know it is collapsed, it cannot grow to multiple lines
				if (explanationDecoration.explanation) {
					data.set(explanationDecoration.explanation.getId(), {
						lineNumber: decorationRange.startLineNumber,
						column: explanationDecoration.explanation.column ? decorationRange.startColumn : undefined,
					});
				}
			}
		}

		try {
			this.ignoreDecorationsChangedEvent = true;
			await this.explanationsService.updateExplanations(data);
		} finally {
			this.ignoreDecorationsChangedEvent = false;
		}
	}

	dispose(): void {
		this.toDispose.forEach(d => d.dispose());
	}
}
