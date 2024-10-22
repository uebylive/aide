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
import './media/aideAgentRichItem.css';
import { Button } from '../../../../../base/browser/ui/button/button.js';

const $ = dom.$;

export interface IActionsPreviewOptions {
	start: number;
	startLabel?: string;
	end: number;
}

export abstract class AideAgentRichItem extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	protected toolbar: MenuWorkbenchToolBar | undefined;
	private actionsPreviewElement: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		headerTitle: string,
		iconId: string,
		stale: boolean,
		private sessionid: string,
		private exchangeId: string,
		readonly menuId: MenuId | null,
		readonly supportsCheckpoint: boolean,
		readonly previewOptions: IActionsPreviewOptions = { start: -1, end: -1 },
		readonly descriptionPart: ChatMarkdownContentPart | undefined,
		readonly instantiationService: IInstantiationService,
		readonly keybindingService: IKeybindingService,
	) {
		super();
		const domNode = this.domNode = $('.aide-rich-item');

		if (stale) {
			domNode.classList.add('stale');
		}
		domNode.setAttribute('tabindex', '0');

		const header = $('.aide-rich-item-header');
		domNode.appendChild(header);

		const heading = $('.aide-rich-item-heading');
		header.appendChild(heading);

		this.instantiationService.createInstance(Heroicon, heading, iconId, { 'class': 'aide-rich-item-icon' });

		const title = $('.aide-rich-item-title');
		heading.appendChild(title);
		title.textContent = headerTitle;

		if (this.descriptionPart) {
			domNode.appendChild(this.descriptionPart.domNode);
			this.descriptionPart.domNode.classList.add('aide-rich-item-description');
		}

		if (this.descriptionPart) {
			this._register(this.descriptionPart.onDidChangeHeight(() => {
				this._onDidChangeHeight.fire();
			}));
		}

		const actionsPreviewElement = this.actionsPreviewElement = $('.aide-rich-item-actions-preview');
		header.appendChild(actionsPreviewElement);

		if (menuId) {
			const toolbarContainer = $('.aide-rich-item-actions');
			header.appendChild(toolbarContainer);

			this.toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, menuId, {
				menuOptions: { shouldForwardArgs: true },
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				actionViewItemProvider: (action) => {
					if (action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
					return undefined;
				}
			}));

			// pass relevent information to the context over here
			this.toolbar.context = {
				'aideAgentSessionId': this.sessionid,
				'aideAgentExchangeId': this.exchangeId,
			};

			dom.addDisposableListener(domNode, dom.EventType.FOCUS_IN, () => {
				//dom.EventHelper.stop(e, true);
				this.domNode.classList.add('focused');
			});

			dom.addDisposableListener(domNode, dom.EventType.FOCUS_OUT, () => {
				this.domNode.classList.remove('focused');
			});

			this.updatePreview();

			this._register(this.toolbar.onDidChangeMenuItems(() => {
				this.updatePreview();
			}));
		}

		if (supportsCheckpoint) {
			const checkPointButtonContainer = $('.aide-rich-item-checkpoint');
			const checkpointButton = this._register(this.instantiationService.createInstance(Button, checkPointButtonContainer, {}));

			const iconContainer = $('.aide-rich-item-checkpoint-icon-container');

			this._register(this.instantiationService.createInstance(Heroicon, checkpointButton.element, 'micro/flag'));

			// elements = dom.h('.interactive-input-part', [
			// 	dom.h('.interactive-input-streaming-state@streamingStateContainer'),
			// 	dom.h('.interactive-input-and-side-toolbar@inputAndSideToolbar', [
			// 		dom.h('.chat-input-container@inputContainer', [
			// 			dom.h('.chat-editor-container@editorContainer'),
			// 			dom.h('.chat-input-toolbars@inputToolbars'),
			// 		]),
			// 	]),
			// 	dom.h('.chat-attached-context@attachedContextContainer'),
			// 	dom.h('.interactive-input-followups@followupsContainer'),
			// ]


		}
	}

	abstract hasSameContent(other: IChatProgressRenderableResponseContent): boolean;

	private updatePreview() {
		if (!this.toolbar) {
			return;

		}
		const numberOfItems = this.toolbar.getItemsLength();
		dom.clearNode(this.actionsPreviewElement);

		for (let i = 0; i < numberOfItems; i++) {
			const startIndex = getIndex(this.previewOptions.start, numberOfItems);
			const endIndex = getIndex(this.previewOptions.end, numberOfItems);

			if (i >= startIndex && i <= endIndex) {
				const action = this.toolbar.getItemAction(i);
				if (!action?.class) {
					console.warn(`Action class not found for ${action?.id} in ${this.menuId}`);
					continue;
				}
				if (this.previewOptions.startLabel && i === startIndex) {
					const label = $('.preview-label');
					this.actionsPreviewElement.appendChild(label);
					label.textContent = this.previewOptions.startLabel;
				}
				const actionPreview = $('.action-label');
				actionPreview.ariaHidden = 'true';
				this.actionsPreviewElement.appendChild(actionPreview);
				actionPreview.classList.add(...action.class.split(' '));
			}
		}
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

function getIndex(indexOrCountBack: number, length: number): number {
	return indexOrCountBack < 0 ? length + indexOrCountBack : indexOrCountBack;
}
