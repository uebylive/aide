/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export class AideProbeDecorationService extends Disposable {
	static readonly ID = 'workbench.contrib.aideProbeDecorationService';

	private editDecorations: Map<string, IEditorDecorationsCollection> = new Map();

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
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
	) {
		super();

		this._register(this.aideProbeService.onNewEdit(async (edits) => {
			let progressiveEditingDecorations = this.editDecorations.get(edits.resource.toString());
			if (!progressiveEditingDecorations) {
				const editor = await this.codeEditorService.openCodeEditor({ resource: edits.resource }, null);
				if (editor && !this.editDecorations.has(edits.resource.toString())) {
					this.editDecorations.set(edits.resource.toString(), editor.createDecorationsCollection());
				}
				progressiveEditingDecorations = this.editDecorations.get(edits.resource.toString());
			}

			const newLines = new Set<number>();
			for (const edit of edits.edits) {
				LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
			}
			const existingRanges = progressiveEditingDecorations!.getRanges().map(LineRange.fromRange);
			for (const existingRange of existingRanges) {
				existingRange.forEach(line => newLines.delete(line));
			}
			const newDecorations: IModelDeltaDecoration[] = [];
			for (const line of newLines) {
				newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: this._decoInsertedText });
			}

			progressiveEditingDecorations!.append(newDecorations);
		}));
	}
}
