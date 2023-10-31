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

export const commandId = 'csChat.action.addContext';

export class KeybindingPillWidget extends Disposable implements IContentWidget {
	public static readonly ID = 'editor.contrib.keybindingPillWidget';

	private readonly _toDispose = new DisposableStore();
	private readonly _domNode: HTMLElement;

	private button: Button | undefined;
	private position: IPosition | undefined;

	private _kbLabel?: string;

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();

		this._domNode = dom.$('div.keybindingPillWidget');

		this._kbLabel = this.getLabel(keybindingService);
		this._register(Event.runAndSubscribe(keybindingService.onDidUpdateKeybindings, () => {
			this._kbLabel = this.getLabel(keybindingService);

			this._updateKeybindingText();
		}));

		this.renderButton();
	}

	private renderButton() {
		this.button = new Button(this._domNode, defaultButtonStyles);
		this._toDispose.add(this.button);
		this._toDispose.add(this.button.onDidClick(() => {
			this._editor.trigger('keyboard', 'csChat.action.addContext', null);
		}));

		this.button.enabled = true;
		this.button.label = this._kbLabel ?? '';
		this.button.element.classList.add('keybinding-pill');
	}

	private getLabel(keybindingService: IKeybindingService): string | undefined {
		return `${keybindingService.lookupKeybinding(commandId)?.getLabel() ?? ''} Add context`;
	}

	override dispose(): void {
		super.dispose();
		this._toDispose.dispose();

		this.position = undefined;
		this.button = undefined;

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

		return {
			position: this.position,
			preference: [ContentWidgetPositionPreference.ABOVE]
		};
	}

	showAt(position: IPosition) {
		this.position = position;
		this._editor.addContentWidget(this);
	}

	hide() {
		this.position = undefined;
		this._editor.removeContentWidget(this);
	}

	private _updateKeybindingText(): void {
		if (this.button) {
			this.button.label = this._kbLabel ?? '';
		}
	}
}
