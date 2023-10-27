/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { registerChatActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatActions';
import { registerChatCodeBlockActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatCodeblockActions';
import { registerChatCopyActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatCopyActions';
import { registerChatExecuteActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatExecuteActions';
import { registerQuickChatActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatQuickInputActions';
import { registerChatTitleActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatTitleActions';
import { registerChatExportActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatImportExport';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ChatContributionService } from 'vs/workbench/contrib/csChat/browser/csChatContributionServiceImpl';
import { ChatEditor, IChatEditorOptions } from 'vs/workbench/contrib/csChat/browser/csChatEditor';
import { ChatEditorInput, ChatEditorInputSerializer } from 'vs/workbench/contrib/csChat/browser/csChatEditorInput';
import { ChatWidgetService } from 'vs/workbench/contrib/csChat/browser/csChatWidget';
import 'vs/workbench/contrib/csChat/browser/contrib/csChatInputEditorContrib';
import 'vs/workbench/contrib/csChat/browser/contrib/csChatHistoryVariables';
import { IChatContributionService } from 'vs/workbench/contrib/csChat/common/csChatContributionService';
import { IChatService } from 'vs/workbench/contrib/csChat/common/csChatService';
import { ChatService } from 'vs/workbench/contrib/csChat/common/csChatServiceImpl';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from 'vs/workbench/contrib/csChat/common/csChatWidgetHistoryService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/csChatColors';
import { registerMoveActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatMoveActions';
import { ACTION_ID_CLEAR_CHAT, registerClearActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatClearActions';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { isResponseVM } from 'vs/workbench/contrib/csChat/common/csChatViewModel';
import { CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/csChat/common/csChatContextKeys';
import { ChatAccessibilityService } from 'vs/workbench/contrib/csChat/browser/csChatAccessibilityService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ChatWelcomeMessageModel } from 'vs/workbench/contrib/csChat/common/csChatModel';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ChatProviderService, IChatProviderService } from 'vs/workbench/contrib/csChat/common/csChatProvider';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/csChat/common/csChatSlashCommands';
import { alertFocusChange } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IChatVariablesService } from 'vs/workbench/contrib/csChat/common/csChatVariables';
import { registerChatFileTreeActions } from 'vs/workbench/contrib/csChat/browser/actions/csChatFileTreeActions';
import { QuickChatService } from 'vs/workbench/contrib/csChat/browser/csChatQuick';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/csChat/common/csChatAgents';
import { ChatVariablesService } from 'vs/workbench/contrib/csChat/browser/csChatVariables';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		'chat.editor.fontSize': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in chat codeblocks."),
			default: isMacintosh ? 12 : 14,
		},
		'chat.editor.fontFamily': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.fontWeight': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.wordWrap': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.wordWrap', "Controls whether lines should wrap in chat codeblocks."),
			default: 'off',
			enum: ['on', 'off']
		},
		'chat.editor.lineHeight': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
			default: 0
		}
	}
});


Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		ChatEditorInput.EditorID,
		nls.localize('chat', "Chat")
	),
	[
		new SyncDescriptor(ChatEditorInput)
	]
);

class ChatResolverContribution extends Disposable {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeChatSesssion}:**/**`,
			{
				id: ChatEditorInput.EditorID,
				label: nls.localize('chat', "Chat"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeChatSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(ChatEditorInput, resource, options as IChatEditorOptions), options };
				}
			}
		));
	}
}

class ChatAccessibleViewContribution extends Disposable {
	static ID: 'chatAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(100, 'panelChat', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const widgetService = accessor.get(IChatWidgetService);
			const codeEditorService = accessor.get(ICodeEditorService);
			return renderAccessibleView(accessibleViewService, widgetService, codeEditorService, true);
			function renderAccessibleView(accessibleViewService: IAccessibleViewService, widgetService: IChatWidgetService, codeEditorService: ICodeEditorService, initialRender?: boolean): boolean {
				const widget = widgetService.lastFocusedWidget;
				if (!widget) {
					return false;
				}
				const chatInputFocused = initialRender && !!codeEditorService.getFocusedCodeEditor();
				if (initialRender && chatInputFocused) {
					widget.focusLastMessage();
				}

				if (!widget) {
					return false;
				}

				const verifiedWidget: IChatWidget = widget;
				const focusedItem = verifiedWidget.getFocus();

				if (!focusedItem) {
					return false;
				}

				widget.focus(focusedItem);
				const isWelcome = focusedItem instanceof ChatWelcomeMessageModel;
				let responseContent = isResponseVM(focusedItem) ? focusedItem.response.asString() : undefined;
				if (isWelcome) {
					const welcomeReplyContents = [];
					for (const content of focusedItem.content) {
						if (Array.isArray(content)) {
							welcomeReplyContents.push(...content.map(m => m.message));
						} else {
							welcomeReplyContents.push((content as IMarkdownString).value);
						}
					}
					responseContent = welcomeReplyContents.join('\n');
				}
				if (!responseContent) {
					return false;
				}
				const responses = verifiedWidget.viewModel?.getItems().filter(i => isResponseVM(i));
				const length = responses?.length;
				const responseIndex = responses?.findIndex(i => i === focusedItem);

				accessibleViewService.show({
					id: AccessibleViewProviderId.Chat,
					verbositySettingKey: AccessibilityVerbositySettingId.Chat,
					provideContent(): string { return responseContent!; },
					onClose() {
						verifiedWidget.reveal(focusedItem);
						if (chatInputFocused) {
							verifiedWidget.focusInput();
						} else {
							verifiedWidget.focus(focusedItem);
						}
					},
					next() {
						verifiedWidget.moveFocus(focusedItem, 'next');
						alertFocusChange(responseIndex, length, 'next');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					previous() {
						verifiedWidget.moveFocus(focusedItem, 'previous');
						alertFocusChange(responseIndex, length, 'previous');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					options: { type: AccessibleViewType.View }
				});
				return true;
			}
		}, CONTEXT_IN_CHAT_SESSION));
	}
}

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Clear the session"),
			sortText: 'z_clear',
			executeImmediately: true
		}, async () => {
			commandService.executeCommand(ACTION_ID_CLEAR_CHAT);
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatResolverContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatSlashStaticSlashCommandsContribution, LifecyclePhase.Eventually);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerClearActions();

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatContributionService, ChatContributionService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(IChatProviderService, ChatProviderService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
