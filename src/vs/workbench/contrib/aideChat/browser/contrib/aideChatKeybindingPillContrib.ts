/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingPillWidget } from 'vs/workbench/contrib/aideChat/browser/aideKeybindingPill';
import { CONTEXT_PROBE_MODE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineAideChat/common/inlineChat';
import { AnchorEditingSelection } from 'vs/workbench/contrib/aideProbe/common/aideProbe';


const editLineDecorationOptions = ModelDecorationOptions.register({
	description: 'aide-probe-anchor-lines',
	blockClassName: 'aide-probe-anchor-lines-block',
	className: 'aide-probe-anchor-line',
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

export interface IKeybindingPillContribution extends IEditorContribution {
	showAnchorEditingDecoration(anchorEditingSelection: AnchorEditingSelection | undefined): void;
	hideAnchorEditingDecoration(): void;
}

export class KeybindingPillContribution implements IKeybindingPillContribution {
	public static readonly ID = 'editor.contrib.keybindingPill';

	private pillWidget: KeybindingPillWidget | null | undefined;
	private editor: ICodeEditor;
	private decorationsCollection: IEditorDecorationsCollection;

	constructor(
		editor: ICodeEditor,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.editor = editor;
		this.decorationsCollection = this.editor.createDecorationsCollection();
		this.pillWidget = this.editor.getContribution<KeybindingPillWidget>(KeybindingPillWidget.ID);


		contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_PROBE_MODE.key]))) {
				if (CONTEXT_PROBE_MODE.bindTo(contextKeyService).get()) {
					this.pillWidget?.hide();
				}
			}
		});


		this.editor.onDidChangeCursorSelection(event => {
			if (isCodeEditor(editor) && !event.selection.isEmpty()) {
				this.pillWidget?.showAt(event.selection.getPosition());
			} else {
				this.pillWidget?.hide();
			}
			this.showAnchorEditingDecoration(this.aideProbeService.anchorEditingSelection);
		});

		this.aideProbeService.onDidSetAnchoredSelection(() => {
			this.showAnchorEditingDecoration(this.aideProbeService.anchorEditingSelection);
		});
	}

	showAnchorEditingDecoration(anchorEditingSelection: AnchorEditingSelection | undefined) {
		if (anchorEditingSelection) {
			const uri = this.editor.getModel()?.uri;
			if (uri?.toString() === anchorEditingSelection.uri.toString()) {
				this.hideAnchorEditingDecoration();
				this.decorationsCollection.append([{
					range: anchorEditingSelection.selection,
					options: editLineDecorationOptions
				}]);
			} else {
				this.hideAnchorEditingDecoration();
			}
		}
	}

	hideAnchorEditingDecoration() {
		this.decorationsCollection.clear();
	}

	dispose() {
		if (this.pillWidget) {
			this.pillWidget.dispose();
			this.pillWidget = null;
		}
	}

	getId(): string {
		return KeybindingPillContribution.ID;
	}
}
