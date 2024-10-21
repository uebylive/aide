/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatContentPart, IChatContentPartRenderContext } from './aideAgentContentParts.js';
import { IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { ISingleCommandButton } from '../../common/aideAgentService.js';
import { isResponseVM } from '../../common/aideAgentViewModel.js';
import { Button } from '../ui/aideButton.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

const $ = dom.$;

class ChatCommandButton extends Disposable {
	constructor(
		parent: HTMLElement,
		commandButton: ISingleCommandButton,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: InstantiationService,
		@ICommandService private readonly commandService: ICommandService
	) {

		super();

		const label = commandButton.buttonOptions?.title || commandButton.command.title;
		const iconId = commandButton.buttonOptions?.codiconId;
		const icon = iconId ? ThemeIcon.fromId(iconId) : undefined;
		const look = commandButton.buttonOptions?.look || 'secondary';

		const enabled = !isResponseVM(context.element) || !context.element.isStale;
		const tooltip = enabled ?
			commandButton.command.tooltip :
			localize('commandButtonDisabled', "Button not available in restored chat");
		const button = this._register(this.instantiationService.createInstance(Button, parent, { ...defaultButtonStyles, secondary: look === 'secondary', supportIcons: !!icon, title: tooltip }));
		if (icon) {
			button.icon = icon;
		}
		button.label = label;
		button.enabled = enabled;

		// TODO still need telemetry for command buttons
		this._register(button.onDidClick(() => this.commandService.executeCommand(commandButton.command.id, ...(commandButton.command.arguments ?? []))));
	}
}


export class ChatCommandButtonContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		commandButton: ISingleCommandButton,
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: InstantiationService,
	) {
		super();

		this.domNode = $('.chat-command-button');
		this._register(this.instantiationService.createInstance(ChatCommandButton, this.domNode, commandButton, context));
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'command';
	}
}

export class ChatCommandGroupContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		commandButtons: ISingleCommandButton[],
		context: IChatContentPartRenderContext,
		@IInstantiationService private readonly instantiationService: InstantiationService,
	) {
		super();

		this.domNode = $('.chat-command-group');

		for (const button of commandButtons) {
			this._register(this.instantiationService.createInstance(ChatCommandButton, this.domNode, button, context));
		}
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'command';
	}
}
