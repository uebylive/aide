/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/cschat';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IChatAccessibilityService, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewOptions } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget, IChatWidgetStyles } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export class CSChatWidget extends ChatWidget {
	constructor(
		override readonly viewContext: IChatWidgetViewContext,
		protected override readonly viewOptions: IChatWidgetViewOptions,
		protected override readonly styles: IChatWidgetStyles,
		@IContextKeyService protected override readonly contextKeyService: IContextKeyService,
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IChatService protected override readonly chatService: IChatService,
		@IChatAgentService protected override readonly chatAgentService: IChatAgentService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IContextMenuService protected override readonly contextMenuService: IContextMenuService,
		@IChatAccessibilityService protected override readonly _chatAccessibilityService: IChatAccessibilityService,
		@IInstantiationService protected override readonly _instantiationService: IInstantiationService,
		@ILogService protected override readonly _logService: ILogService,
		@IThemeService protected override readonly _themeService: IThemeService
	) {
		super(viewContext, viewOptions, styles, contextKeyService, instantiationService, chatService, chatAgentService, chatWidgetService, contextMenuService, _chatAccessibilityService, _instantiationService, _logService, _themeService);
	}
}
