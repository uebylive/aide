/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';

export const addContextCommandId = 'workbench.action.aideChat.addContext';
export const anchoredEditingCommandId = 'workbench.action.aideProbe.enterAnchoredEditing';
// export const agenticEditingCommandId = 'workbench.action.aideProbe.enterAgenticEditing';

export class KeybindingPillWidget extends Disposable implements IContentWidget {
	public static readonly ID = 'editor.contrib.keybindingPillWidget';

	private readonly _toDispose = new DisposableStore();
	private readonly _domNode: HTMLElement;

	private isVisible: boolean = false;
	private addContextButton: Button | undefined;
	private anchoredEditingButton: Button | undefined;
	//private agenticEditingButton: Button | undefined;

	private addContextLabel?: string;
	private anchoredEditingLabel?: string;
	//private agenticEditingLabel?: string;

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();

		this._domNode = dom.$('div.keybindingPillWidget');
		this.renderButtons();
		this.updateLabels(keybindingService);

		this._register(Event.runAndSubscribe(keybindingService.onDidUpdateKeybindings, () => {
			this.updateLabels(keybindingService);
		}));
	}

	private renderButtons() {
		this.anchoredEditingButton = new Button(this._domNode, defaultButtonStyles);
		//this.agenticEditingButton = new Button(this._domNode, defaultButtonStyles);
		this.addContextButton = new Button(this._domNode, defaultButtonStyles);

		this._toDispose.add(this.anchoredEditingButton);
		this._toDispose.add(this.anchoredEditingButton.onDidClick(() => {
			this._editor.trigger('keyboard', anchoredEditingCommandId, null);
			this.hide();
		}));

		//this._toDispose.add(this.agenticEditingButton);
		//this._toDispose.add(this.agenticEditingButton.onDidClick(() => {
		//	this._editor.trigger('keyboard', agenticEditingCommandId, null);
		//	this.hide();
		//}));


		this._toDispose.add(this.addContextButton);
		this._toDispose.add(this.addContextButton.onDidClick(() => {
			this._editor.trigger('keyboard', addContextCommandId, null);
			this.hide();
		}));

		this.anchoredEditingButton.enabled = true;
		this.anchoredEditingButton.element.classList.add('keybinding-pill');

		// this.agenticEditingButton.enabled = true;
		// this.agenticEditingButton.element.classList.add('keybinding-pill');

		this.addContextButton.enabled = true;
		this.addContextButton.element.classList.add('keybinding-pill');
	}

	private updateLabels(keybindingService: IKeybindingService) {
		this.addContextLabel = `${keybindingService.lookupKeybinding(addContextCommandId)?.getLabel() ?? ''} Add context`;
		if (this.addContextButton) {
			this.addContextButton.label = this.addContextLabel;
		}

		this.anchoredEditingLabel = `${keybindingService.lookupKeybinding(anchoredEditingCommandId)?.getLabel() ?? ''} Anchored editing`;
		if (this.anchoredEditingButton) {
			this.anchoredEditingButton.label = this.anchoredEditingLabel;
		}

		//this.agenticEditingLabel = `${keybindingService.lookupKeybinding(agenticEditingCommandId)?.getLabel() ?? ''} Agentic editing`;
		//if (this.agenticEditingButton) {
		//	this.agenticEditingButton.label = this.agenticEditingLabel;
		//}
	}

	override dispose(): void {
		super.dispose();
		this._toDispose.dispose();

		this.addContextButton = undefined;
		this.anchoredEditingButton = undefined;
		//this.agenticEditingButton = undefined;

		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'KeybindingPillWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		const selection = this._editor.getSelection();
		if (!selection) {
			return null;
		}

		const selectionStartLine = selection.selectionStartLineNumber;
		if (selection.startLineNumber === selectionStartLine) {
			// this is from a top-to-bottom-selection
			// so we want to show the widget on the top
			return {
				position: {
					lineNumber: selectionStartLine,
					column: selection.startColumn,
				},
				preference: [ContentWidgetPositionPreference.ABOVE]
			};
		} else {
			// this is from bottom-to-top selection
			// so we want to return the position to the bottom
			return {
				position: {
					lineNumber: selection.endLineNumber,
					column: selection.endColumn,
				},
				preference: [ContentWidgetPositionPreference.BELOW],
			};
		}
	}

	showAt(position: IPosition) {
		if (this.isVisible) {
			this._editor.layoutContentWidget(this);
		} else {
			this._editor.addContentWidget(this);
		}
	}

	hide() {
		this._editor.removeContentWidget(this);
		this.isVisible = false;
	}
}
