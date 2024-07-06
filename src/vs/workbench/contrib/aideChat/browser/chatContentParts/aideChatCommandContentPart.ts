/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/aideChat/browser/chatContentParts/aideChatContentParts';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/aideChat/common/aideChatModel';
import { IAideChatCommandButton } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { isResponseVM } from 'vs/workbench/contrib/aideChat/common/aideChatViewModel';

const $ = dom.$;

export class ChatCommandButtonContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		commandButton: IAideChatCommandButton,
		context: IChatContentPartRenderContext,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.domNode = $('.chat-command-button');
		const enabled = !isResponseVM(context.element) || !context.element.isStale;
		const tooltip = enabled ?
			commandButton.command.tooltip :
			localize('commandButtonDisabled', "Button not available in restored chat");
		const button = this._register(new Button(this.domNode, { ...defaultButtonStyles, supportIcons: true, title: tooltip }));
		button.label = commandButton.command.title;
		button.enabled = enabled;

		// TODO still need telemetry for command buttons
		this._register(button.onDidClick(() => this.commandService.executeCommand(commandButton.command.id, ...(commandButton.command.arguments ?? []))));
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'command';
	}
}
