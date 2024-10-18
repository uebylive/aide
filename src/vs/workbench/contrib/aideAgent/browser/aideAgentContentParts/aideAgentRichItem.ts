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
const $ = dom.$;

export interface IActionsPreviewOptions {
	start: number;
	startLabel?: string;
	end: number;
}


export abstract class AideAgentRichItem extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	protected toolbar: MenuWorkbenchToolBar | undefined;
	private toolbarElement: HTMLElement | undefined;
	private cachedToolbarWidth: number | undefined;
	private actionsPreviewElement: HTMLElement | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		headerTitle: string,
		iconId: string,
		readonly previewOptions: IActionsPreviewOptions,
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

			const actionsContainer = this.toolbarElement = $('.rich-item-actions');
			header.appendChild(actionsContainer);

			this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, menuId, {
				menuOptions: { shouldForwardArgs: true },
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				actionViewItemProvider: (action) => {
					if (action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
					return undefined;
				}
			}));

			const actionsPreviewElement = this.actionsPreviewElement = $('.rich-item-actions-preview');
			header.appendChild(actionsPreviewElement);
			this.updatePreview();

			this._register(this.toolbar.onDidChangeMenuItems(() => {
				this.updatePreview();
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

	private updatePreview() {
		if (!this.toolbar || !this.actionsPreviewElement || !this.previewOptions) {
			return;
		}
		const numberOfItems = this.toolbar.getItemsLength();
		dom.clearNode(this.actionsPreviewElement);
		for (let i = 0; i < numberOfItems; i++) {
			if (i >= this.previewOptions.start || i < this.previewOptions.end) {
				const action = this.toolbar.getItemAction(i);
				if (!action?.class) {
					continue;
				}
				const actionPlaceholder = $('.rich-item-actions-preview');
				this.actionsPreviewElement.appendChild(actionPlaceholder);
				actionPlaceholder.classList.add(...action.class.split(' '));
			}
		}
	}

	layout(): void {
		if (this.toolbar && this.toolbarElement) {
			if (!this.cachedToolbarWidth || (typeof this.cachedToolbarWidth === 'number' && this.cachedToolbarWidth !== this.toolbar.getItemsWidth())) {
				this.cachedToolbarWidth = this.toolbar.getItemsWidth();
				this.toolbarElement.style.width = `${this.cachedToolbarWidth}px`;
			}
		}
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
