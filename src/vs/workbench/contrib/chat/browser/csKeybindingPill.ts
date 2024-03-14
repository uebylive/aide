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

export const addContextCommandId = 'workbench.action.chat.addContext';
export const inlineChatCommandId = 'inlineChat.start';

export class KeybindingPillWidget extends Disposable implements IContentWidget {
	public static readonly ID = 'editor.contrib.keybindingPillWidget';

	private readonly _toDispose = new DisposableStore();
	private readonly _domNode: HTMLElement;

	private isVisible: boolean = false;
	private addContextButton: Button | undefined;
	private inlineChatButton: Button | undefined;
	private position: IPosition | undefined;

	private addContextLabel?: string;
	private inlineChatLabel?: string;

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
		this.inlineChatButton = new Button(this._domNode, defaultButtonStyles);
		this.addContextButton = new Button(this._domNode, defaultButtonStyles);
		this._toDispose.add(this.inlineChatButton);
		this._toDispose.add(this.inlineChatButton.onDidClick(() => {
			this._editor.trigger('keyboard', inlineChatCommandId, null);
			this.hide();
		}));
		this._toDispose.add(this.addContextButton);
		this._toDispose.add(this.addContextButton.onDidClick(() => {
			this._editor.trigger('keyboard', addContextCommandId, null);
			this.hide();
		}));

		this.inlineChatButton.enabled = true;
		this.inlineChatButton.element.classList.add('keybinding-pill');
		this.addContextButton.enabled = true;
		this.addContextButton.element.classList.add('keybinding-pill');
	}

	private updateLabels(keybindingService: IKeybindingService) {
		this.addContextLabel = `${keybindingService.lookupKeybinding(addContextCommandId)?.getLabel() ?? ''} Add context`;
		if (this.addContextButton) {
			this.addContextButton.label = this.addContextLabel;
		}

		this.inlineChatLabel = `${keybindingService.lookupKeybinding(inlineChatCommandId)?.getLabel() ?? ''} Edit Code`;
		if (this.inlineChatButton) {
			this.inlineChatButton.label = this.inlineChatLabel;
		}
	}

	override dispose(): void {
		super.dispose();
		this._toDispose.dispose();

		this.position = undefined;
		this.addContextButton = undefined;

		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'KeybindingPillWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.position) {
			return null;
		}

		// move the column to the end of the line
		const position = {
			lineNumber: this.position.lineNumber,
			column: this.position.column + 1000,
		};

		return {
			position,
			// position: this.position,
			preference: [ContentWidgetPositionPreference.ABOVE]
		};
	}

	showAt(position: IPosition) {
		this.position = position;
		if (this.isVisible) {
			this._editor.layoutContentWidget(this);
		} else {
			this._editor.addContentWidget(this);
		}
	}

	hide() {
		this.position = undefined;
		this._editor.removeContentWidget(this);
		this.isVisible = false;
	}
}
