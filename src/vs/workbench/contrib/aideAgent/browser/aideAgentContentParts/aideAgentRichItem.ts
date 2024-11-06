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
import { IChatContentPart } from './aideAgentContentParts.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
import { IAideAgentPlanService } from '../../common/aideAgentPlanService.js';
import './media/aideAgentRichItem.css';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ActionViewItemWithKb } from '../../../../../platform/actionbarWithKeybindings/browser/actionViewItemWithKb.js';

const $ = dom.$;

/*export interface IActionsPreviewOptions {
	start: number;
	startLabel?: string;
	end: number;
}*/

export interface IRichItemContext {
	aideAgentSessionId: string;
	aideAgentExchangeId: string;
}

export abstract class AideAgentRichItem extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	_toolbar: MenuWorkbenchToolBar | undefined;
	// private actionsPreviewElement: HTMLElement;

	//private readonly context: IRichItemContext;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		headerTitle: string,
		iconId: string,
		stale: boolean,
		private sessionId: string,
		private exchangeId: string,
		readonly menuId: MenuId | null,
		//readonly previewOptions: IActionsPreviewOptions = { start: -1, end: -1 },
		readonly descriptionOrDescriptionPart: string | ChatMarkdownContentPart | undefined,
		readonly instantiationService: IInstantiationService,
		readonly keybindingService: IKeybindingService,
		readonly aideAgentPlanService: IAideAgentPlanService,
		readonly commandsService: ICommandService,
	) {
		super();
		const domNode = this.domNode = $('.aide-rich-block');

		//this.context = {
		//	aideAgentSessionId: this.sessionId,
		//	aideAgentExchangeId: this.exchangeId
		//};

		//if (supportsCheckpoint) {
		//const checkpointButton = this._register(this.instantiationService.createInstance(CheckpointFlag, true, undefined));
		//
		//this._register(dom.addDisposableListener(checkpointButton.domNode, dom.EventType.CLICK, async (e: MouseEvent) => {
		//	this.commandsService.executeCommand('workbench.action.aideAgent.revert', this.context);
		//}));
		//
		//domNode.appendChild(checkpointButton.domNode);
		// const planReviewButtonContainer = $('.aide-rich-item-plan');
		// const planReviewButton = this._register(this.instantiationService.createInstance(Button, planReviewButtonContainer, defaultButtonStyles));
		// planReviewButton.label = 'planView';
		// planReviewButton.onDidClick(() => {
		// 	// forces the view pane to open up
		// 	this.aideAgentPlanService.anchorPlanViewPane(sessionId, exchangeId);
		// });
		//
		// dom.addDisposableListener(planReviewButton.element, dom.EventType.CLICK, async (e: MouseEvent) => {
		// 	dom.EventHelper.stop(e, true);
		// 	this.aideAgentPlanService.anchorPlanViewPane(sessionId, exchangeId);
		// });
		// domNode.appendChild(planReviewButtonContainer);
		//}

		const itemElement = domNode.appendChild($('.aide-rich-item'));

		if (stale) {
			itemElement.classList.add('stale');
		}
		itemElement.setAttribute('tabindex', '0');

		const header = $('.aide-rich-item-header');
		itemElement.appendChild(header);

		const heading = $('.aide-rich-item-heading');
		header.appendChild(heading);

		// this.instantiationService.createInstance(Heroicon, heading, iconId, { 'class': 'aide-rich-item-icon' });
		heading.appendChild($(`.aide-rich-item-icon.codicon.codicon-${iconId}`));

		const title = $('.aide-rich-item-title');
		heading.appendChild(title);
		title.textContent = headerTitle;

		if (this.descriptionOrDescriptionPart) {
			if (typeof this.descriptionOrDescriptionPart === 'string') {
				const description = this.descriptionOrDescriptionPart;
				const descriptionElement = itemElement.appendChild($('.aide-rich-item-description'));
				descriptionElement.textContent = description;
			} else if (this.descriptionOrDescriptionPart instanceof ChatMarkdownContentPart) {
				const descriptionPart = this.descriptionOrDescriptionPart;
				itemElement.appendChild(descriptionPart.domNode);
				descriptionPart.domNode.classList.add('aide-rich-item-description');
				this._register(descriptionPart.onDidChangeHeight(() => {
					this._onDidChangeHeight.fire();
				}));
			}
		}
		//const actionsPreviewElement = this.actionsPreviewElement = $('.aide-rich-item-actions-preview');
		// header.appendChild(actionsPreviewElement);

		if (menuId) {
			const toolbarContainer = $('.aide-rich-item-actions');
			header.appendChild(toolbarContainer);

			this._toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, menuId, {
				menuOptions: { shouldForwardArgs: true },
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				actionViewItemProvider: (action) => {
					if (action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(ActionViewItemWithKb, action);
					}
					return undefined;
				}
			}));

			// pass relevent information to the context over here
			this._toolbar.context = {
				'aideAgentSessionId': this.sessionId,
				'aideAgentExchangeId': this.exchangeId,
			};

			dom.addDisposableListener(itemElement, dom.EventType.FOCUS_IN, () => {
				//dom.EventHelper.stop(e, true);
				itemElement.classList.add('focused');
			});

			dom.addDisposableListener(itemElement, dom.EventType.FOCUS_OUT, () => {
				itemElement.classList.remove('focused');
			});

			//this.updatePreview();

			// this._register(this._toolbar.onDidChangeMenuItems(() => {
			// 	this.updatePreview();
			// }));
		}
	}

	abstract hasSameContent(other: IChatProgressRenderableResponseContent): boolean;
	/*
	private updatePreview() {
		if (!this._toolbar) {
			return;

		}
		const numberOfItems = this._toolbar.getItemsLength();
		dom.clearNode(this.actionsPreviewElement);

		for (let i = 0; i < numberOfItems; i++) {
			const startIndex = getIndex(this.previewOptions.start, numberOfItems);
			const endIndex = getIndex(this.previewOptions.end, numberOfItems);

			if (i >= startIndex && i <= endIndex) {
				const action = this._toolbar.getItemAction(i);
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
	}*/

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

// function getIndex(indexOrCountBack: number, length: number): number {
// 	return indexOrCountBack < 0 ? length + indexOrCountBack : indexOrCountBack;
// }
