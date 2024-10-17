/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Heroicon } from '../../../../browser/heroicon.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';

const $ = dom.$;

export abstract class AideAgentRichItem extends Disposable {
	public readonly domNode: HTMLElement;
	protected toolBar: MenuWorkbenchToolBar | undefined;
	private actionsContainer: HTMLElement | undefined;
	private cachedToolbarWidth: number | undefined;

	constructor(
		headerTitle: string,
		iconId: string,
		menuId: MenuId | null,
		readonly instantiationService: IInstantiationService,
		readonly keybindingService: IKeybindingService,
	) {
		super();
		this.domNode = $('.rich-item');
		this.domNode.setAttribute('tabindex', '0');

		const header = $('.rich-item-header');
		this.domNode.appendChild(header);

		const heading = $('.rich-item-heading');
		header.appendChild(heading);

		this.instantiationService.createInstance(Heroicon, heading, iconId, { 'class': 'rich-item-icon' });

		const title = $('.rich-item-title');
		heading.appendChild(title);
		title.textContent = headerTitle;

		if (menuId) {
			const actionsContainer = this.actionsContainer = $('.rich-item-actions');
			header.appendChild(actionsContainer);

			this.toolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, menuId, {
				menuOptions: { shouldForwardArgs: true },
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				actionViewItemProvider: (action) => {
					if (action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
					return undefined;
				}
			}));


			this._register(this.toolBar.onDidChangeMenuItems(() => {
				this.layout();
			}));
			this.layout();
		}
	}

	private layout() {
		if (this.toolBar && this.actionsContainer) {
			if (typeof this.cachedToolbarWidth === 'number' && this.cachedToolbarWidth !== this.toolBar.getItemsWidth()) {
				this.cachedToolbarWidth = this.toolBar.getItemsWidth();
				this.actionsContainer.style.width = `${this.cachedToolbarWidth}px`;
			}
		}
	}
}
