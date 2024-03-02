/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { FileAccess } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IAIModelSelectionService } from 'vs/platform/aiModel/common/aiModels';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { IChatRequester } from 'vs/workbench/contrib/chat/browser/csChat';
import { IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';

const $ = dom.$;

export class CSChatInputPart extends ChatInputPart {
	private requesterContainer!: HTMLElement;
	private modelNameContainer!: HTMLElement;

	constructor(
		protected override readonly options: { renderFollowups: boolean; renderStyle?: 'default' | 'compact' },
		@IChatWidgetHistoryService protected override readonly historyService: IChatWidgetHistoryService,
		@IModelService protected override readonly modelService: IModelService,
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IContextKeyService protected override readonly contextKeyService: IContextKeyService,
		@IConfigurationService protected override readonly configurationService: IConfigurationService,
		@IKeybindingService protected override readonly keybindingService: IKeybindingService,
		@IAccessibilityService protected override readonly accessibilityService: IAccessibilityService,
		@IAIModelSelectionService private readonly aiModelSelectionService: IAIModelSelectionService
	) {
		super(options, historyService, modelService, instantiationService, contextKeyService, configurationService, keybindingService, accessibilityService);

		this._register(this.aiModelSelectionService.onDidChangeModelSelection(() => {
			this._renderModelName();
		}));
	}

	override setState(providerId: string, inputValue: string | undefined, requester?: IChatRequester): void {
		super.setState(providerId, inputValue);

		if (requester) {
			this._renderRequester(requester);
		}
		this._renderModelName();
	}

	private _renderRequester(requester: IChatRequester): void {
		const username = requester.username || localize('requester', "You");
		this.requesterContainer.querySelector('h3.username')!.textContent = username;

		const avatarContainer = this.requesterContainer.querySelector('.avatar-container')!;
		if (requester.avatarIconUri) {
			const avatarImgIcon = $<HTMLImageElement>('img.icon');
			avatarImgIcon.src = FileAccess.uriToBrowserUri(requester.avatarIconUri).toString(true);
			avatarContainer.replaceChildren($('.avatar', undefined, avatarImgIcon));
		} else {
			const defaultIcon = Codicon.account;
			const avatarIcon = $(ThemeIcon.asCSSSelector(defaultIcon));
			avatarContainer.replaceChildren($('.avatar.codicon-avatar', undefined, avatarIcon));
		}
	}

	private async _renderModelName(): Promise<void> {
		const modelSelectionSettings = await this.aiModelSelectionService.getValidatedModelSelectionSettings();
		const modelName = modelSelectionSettings.models[modelSelectionSettings.slowModel].name;

		if (modelName) {
			this.modelNameContainer.textContent = modelName;
			this.modelNameContainer.style.display = 'block';
		} else {
			this.modelNameContainer.style.display = 'none';
		}
	}

	override render(container: HTMLElement, initialValue: string, widget: IChatWidget) {
		super.render(container, initialValue, widget);

		const secondChild = this.container.childNodes[1];
		const header = $('.header');
		this.container.insertBefore(header, secondChild);
		const user = dom.append(header, $('.user'));
		const model = dom.append(header, $('.slow-model'));
		dom.append(user, $('.avatar-container'));
		dom.append(user, $('h3.username'));
		this.requesterContainer = user;
		this.modelNameContainer = model;
		this.modelNameContainer.style.display = 'none';

		this.inputEditor.updateOptions({
			fontFamily: EDITOR_FONT_DEFAULTS.fontFamily,
			cursorWidth: 3,
			acceptSuggestionOnEnter: 'on'
		});
	}
}
