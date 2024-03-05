/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { KeybindingPillWidget } from 'vs/workbench/contrib/chat/browser/csKeybindingPill';

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
