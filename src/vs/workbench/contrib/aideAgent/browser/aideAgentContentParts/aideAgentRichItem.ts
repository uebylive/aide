/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Heroicon } from '../../../../browser/heroicon.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IChatContentPart } from './aideAgentContentParts.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';

const $ = dom.$;

export abstract class AideAgentRichItem extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	protected toolBar: MenuWorkbenchToolBar | undefined;
	private actionsContainer: HTMLElement | undefined;
	private cachedToolbarWidth: number | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		headerTitle: string,
		iconId: string,
		actionsPreview: ActionViewItem[],
		menuId: MenuId | null,
		//readonly currentWidth: number,
		stale: boolean,
		readonly descriptionPart: ChatMarkdownContentPart | undefined,
		readonly instantiationService: IInstantiationService,
		readonly keybindingService: IKeybindingService,
	) {
		super();
		const domNode = this.domNode = $('.rich-item');
		if (stale) {
			domNode.classList.add('stale');
		}
		domNode.setAttribute('tabindex', '0');

		const header = $('.rich-item-header');
		domNode.appendChild(header);

		const heading = $('.rich-item-heading');
		header.appendChild(heading);

		this.instantiationService.createInstance(Heroicon, heading, iconId, { 'class': 'rich-item-icon' });

		const title = $('.rich-item-title');
		heading.appendChild(title);
		title.textContent = headerTitle;

		if (this.descriptionPart) {
			domNode.appendChild(this.descriptionPart.domNode);
			this.descriptionPart.domNode.classList.add('rich-item-description');
		}

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

			if (this.descriptionPart) {
				this._register(this.descriptionPart.onDidChangeHeight(() => {
					this._onDidChangeHeight.fire();
				}));
			}
		}
	}

	abstract hasSameContent(other: IChatProgressRenderableResponseContent): boolean;

	layout(): void {
		if (this.toolBar && this.actionsContainer) {
			if (!this.cachedToolbarWidth || (typeof this.cachedToolbarWidth === 'number' && this.cachedToolbarWidth !== this.toolBar.getItemsWidth())) {
				this.cachedToolbarWidth = this.toolBar.getItemsWidth();
				this.actionsContainer.style.width = `${this.cachedToolbarWidth}px`;
			}
		}
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
