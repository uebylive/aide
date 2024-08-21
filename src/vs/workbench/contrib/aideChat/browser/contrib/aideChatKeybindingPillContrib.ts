/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingPillWidget } from 'vs/workbench/contrib/aideChat/browser/aideKeybindingPill';
import { CONTEXT_PROBE_HAS_VALID_SELECTION } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeService';

export class KeybindingPillContribution implements IEditorContribution {
	public static readonly ID = 'editor.contrib.keybindingPill';

	private pillWidget: KeybindingPillWidget | null | undefined;
	private editor: ICodeEditor;
	private hasValidSelection: IContextKey<boolean>;

	constructor(editor: ICodeEditor, @IAideProbeService aideProbeService: IAideProbeService, @IContextKeyService contextKeyService: IContextKeyService) {
		this.editor = editor;
		this.pillWidget = this.editor.getContribution<KeybindingPillWidget>(KeybindingPillWidget.ID);

		this.hasValidSelection = CONTEXT_PROBE_HAS_VALID_SELECTION.bindTo(contextKeyService);

		this.editor.onDidChangeCursorSelection(event => {
			if (event.selection.isEmpty()) {
				this.hasValidSelection.set(false);
				aideProbeService.setCurrentSelection(undefined);
				this.pillWidget?.hide();
			} else {
				const uri = editor.getModel()?.uri;
				if (uri) {
					this.hasValidSelection.set(true);
					aideProbeService.setCurrentSelection({ uri, selection: event.selection });
					this.pillWidget?.showAt(event.selection.getPosition());
				}
			}
		});
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
