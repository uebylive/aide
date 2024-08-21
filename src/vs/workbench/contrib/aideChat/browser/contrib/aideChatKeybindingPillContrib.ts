/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingPillWidget } from 'vs/workbench/contrib/aideChat/browser/aideKeybindingPill';
import { CONTEXT_PROBE_HAS_VALID_SELECTION } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';
import { minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineAideChat/common/inlineChat';


const editLineDecorationOptions = ModelDecorationOptions.register({
	description: 'aide-probe-anchor-lines',
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

export class KeybindingPillContribution implements IEditorContribution {
	public static readonly ID = 'editor.contrib.keybindingPill';

	private pillWidget: KeybindingPillWidget | null | undefined;
	private editor: ICodeEditor;
	private decorationsCollection: IEditorDecorationsCollection;
	private hasValidSelection: IContextKey<boolean>;

	constructor(editor: ICodeEditor, @IAideProbeService private readonly aideProbeService: IAideProbeService, @IContextKeyService contextKeyService: IContextKeyService) {
		this.editor = editor;
		this.decorationsCollection = this.editor.createDecorationsCollection();
		this.pillWidget = this.editor.getContribution<KeybindingPillWidget>(KeybindingPillWidget.ID);

		this.hasValidSelection = CONTEXT_PROBE_HAS_VALID_SELECTION.bindTo(contextKeyService);

		this.aideProbeService.onDidStartProbing(() => {
			this.showAnchorEditingDecoration();
		});

		this.editor.onDidChangeCursorSelection(event => {
			if (event.selection.isEmpty()) {
				this.hasValidSelection.set(false);
				aideProbeService.setCurrentSelection(undefined);
				this.pillWidget?.hide();
				this.hideAnchorEditingDecoration();
			} else {
				const uri = editor.getModel()?.uri;
				if (uri) {
					this.hasValidSelection.set(true);
					aideProbeService.setCurrentSelection({ uri, selection: event.selection });
					this.pillWidget?.showAt(event.selection.getPosition());
					this.showAnchorEditingDecoration();
				}
				this.hideAnchorEditingDecoration();
			}
		});
	}

	showAnchorEditingDecoration() {
		const uri = this.editor.getModel()?.uri;
		const currentSelection = this.aideProbeService.currentSelection?.selection;
		const anchorEditingSelection = this.aideProbeService.anchorEditingSelection?.selection;

		if (uri?.toString() === this.aideProbeService.anchorEditingSelection?.uri.toString() && currentSelection && anchorEditingSelection && currentSelection.equalsSelection(anchorEditingSelection)) {
			this.decorationsCollection.append([{
				range: anchorEditingSelection,
				options: editLineDecorationOptions
			}]);
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
