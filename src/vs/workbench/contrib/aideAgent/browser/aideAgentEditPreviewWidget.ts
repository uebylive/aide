/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './media/aideAgentEditPreviewWidget.css';

export class AideAgentEditPreviewWidget extends Disposable {
	protected readonly _elements = h(
		'div.aideagent-edit-preview@root',
		[
			h('div.header@header', [
				h('div.title@title', [
					h('div.icon@icon'),
					h('div.title@titleText'),
				]),
				h('div.actions-toolbar@toolbar'),
			])
		]
	);

	constructor(
		parent: HTMLElement,
	) {
		super();

		parent.appendChild(this._elements.root);
		this.render();
	}

	private render() {
		const iconElement = this._elements.icon;
		const icon = ThemeIcon.modify(Codicon.sync, 'spin');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));

		const titleElement = this._elements.titleText;
		titleElement.textContent = 'Applying edits';
	}

	updateProgress(message: string) {
		const titleElement = this._elements.titleText;
		titleElement.textContent = message;
	}
}
