/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import './media/aideAgentEditPreviewWidget.css';

export interface IAideAgentEditPreviewContext {
	exchangeId: string;
}

export function isAideAgentEditPreviewContext(thing: unknown): thing is IAideAgentEditPreviewContext {
	return typeof thing === 'object' && thing !== null && 'exchangeId' in thing;
}

const defaultIconClasses = ThemeIcon.asClassNameArray(Codicon.symbolEvent);
const progressIconClasses = ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.sync, 'spin'));

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

	private isProgressing = false;
	private toolbar!: MenuWorkbenchToolBar;

	constructor(
		parent: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		parent.appendChild(this._elements.root);
		this.render();
	}

	private render() {
		const iconElement = this._elements.icon;
		iconElement.classList.add(...defaultIconClasses);

		const titleElement = this._elements.titleText;
		titleElement.textContent = 'Applying edits';

		const toolbarContainer = this._elements.toolbar;
		this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.AideAgentEditPreviewWidget, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
	}

	updateProgress(message: string, exchangeId: string) {
		if (message === 'Complete') {
			this._elements.icon.classList.remove(...progressIconClasses);
			this._elements.icon.classList.add(...defaultIconClasses);
			this.isProgressing = false;
		} else if (!this.isProgressing) {
			this._elements.icon.classList.remove(...defaultIconClasses);
			this._elements.icon.classList.add(...progressIconClasses);
			this.isProgressing = true;
		}

		const titleElement = this._elements.titleText;
		titleElement.textContent = message;

		this.toolbar.context = { exchangeId } as IAideAgentEditPreviewContext;
	}
}
