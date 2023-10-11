/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./chatAtSymbolContentWidget';
import { Disposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget } from 'vs/editor/browser/editorBrowser';

export class AtSymbolContentWidget extends Disposable implements IContentWidget {
	private _domNode = document.createElement('div');

	constructor(private _editor: ICodeEditor, private atSymbol: string, private position: Position) {
		super();
		this.atSymbol = atSymbol;
		this.position = position;

		this._domNode.toggleAttribute('hidden', true);
		this._domNode.setAttribute('contenteditable', 'false');
		this._domNode.classList.add('chat-at-symbol-content-widget');
		this._domNode.innerText = this.atSymbol;

		// If backspace at a slash command boundary, remove the slash command
		// this._register(this._editor.onKeyDown((e) => this._handleKeyDown(e)));
	}

	override dispose() {
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	getId() { return 'chat-at-symbol-content-widget'; }
	getDomNode() { return this._domNode; }
	getPosition() { return { position: this.position, preference: [ContentWidgetPositionPreference.EXACT] }; }
}
