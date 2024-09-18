/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { KeybindingPillWidget } from '../../../../../workbench/contrib/aideChat/browser/aideKeybindingPill.js';

export class KeybindingPillContribution implements IEditorContribution {
	public static readonly ID = 'editor.contrib.keybindingPill';

	private pillWidget: KeybindingPillWidget | null | undefined;
	private editor: ICodeEditor;

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.pillWidget = this.editor.getContribution<KeybindingPillWidget>(KeybindingPillWidget.ID);

		this.editor.onDidChangeCursorSelection(event => {
			if (event.selection.isEmpty()) {
				this.pillWidget?.hide();
			} else {
				this.pillWidget?.showAt(event.selection.getPosition());
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
