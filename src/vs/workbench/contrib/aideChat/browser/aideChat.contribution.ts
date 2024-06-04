/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { ChatAccessibilityHelp } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatAccessibilityHelp';
import { registerChatActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatActions';
import { ACTION_ID_NEW_CHAT, registerNewChatActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatClearActions';
import { registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatCodeblockActions';
import { registerChatCopyActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatCopyActions';
import { SubmitAction, registerChatExecuteActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatExecuteActions';
import { registerChatFileTreeActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatFileTreeActions';
import { registerChatExportActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatImportExport';
import { registerMoveActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatMoveActions';
import { registerChatTitleActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatTitleActions';
import { IAideChatAccessibilityService, IAideChatCodeBlockContextProviderService, IAideChatWidgetService } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { ChatAccessibilityService } from 'vs/workbench/contrib/aideChat/browser/aideChatAccessibilityService';
import { ChatEditor, IChatEditorOptions } from 'vs/workbench/contrib/aideChat/browser/aideChatEditor';
import { AideChatEditorInput, ChatEditorInputSerializer } from 'vs/workbench/contrib/aideChat/browser/aideChatEditorInput';
import { agentSlashCommandToMarkdown, agentToMarkdown } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownDecorationsRenderer';
import { ChatExtensionPointHandler } from 'vs/workbench/contrib/aideChat/browser/aideChatParticipantContributions';
import { ChatResponseAccessibleView } from 'vs/workbench/contrib/aideChat/browser/aideChatResponseAccessibleView';
import { ChatVariablesService } from 'vs/workbench/contrib/aideChat/browser/aideChatVariables';
import { ChatWidgetService } from 'vs/workbench/contrib/aideChat/browser/aideChatWidget';
import { ChatCodeBlockContextProviderService } from 'vs/workbench/contrib/aideChat/browser/codeBlockContextProviderService';
import 'vs/workbench/contrib/aideChat/browser/contrib/aideChatInputCompletions';
import 'vs/workbench/contrib/aideChat/browser/contrib/chatInputEditorContrib';
import { AideChatAgentLocation, ChatAgentNameService, ChatAgentService, IAideChatAgentNameService, IAideChatAgentService } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';
import { chatVariableLeader } from 'vs/workbench/contrib/aideChat/common/aideChatParserTypes';
import { IAideChatService } from 'vs/workbench/contrib/aideChat/common/aideChatService';
import { ChatService } from 'vs/workbench/contrib/aideChat/common/aideChatServiceImpl';
import { ChatSlashCommandService, IAideChatSlashCommandService } from 'vs/workbench/contrib/aideChat/common/aideChatSlashCommands';
import { IAideChatVariablesService } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';
import { ChatWidgetHistoryService, IAideChatWidgetHistoryService } from 'vs/workbench/contrib/aideChat/common/aideChatWidgetHistoryService';
import { IAIModelsService, AIModelsService } from 'vs/workbench/contrib/aideChat/common/languageModels';
import { IAIModelStatsService, AIModelStatsService } from 'vs/workbench/contrib/aideChat/common/languageModelStats';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/aideChatColors';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'aideChatSidebar',
	title: nls.localize('aideChatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		'aideChat.editor.fontSize': {
			type: 'number',
			description: nls.localize('aideChat.editor.fontSize', "Controls the font size in pixels in chat codeblocks."),
			default: isMacintosh ? 12 : 14,
		},
		'aideChat.editor.fontFamily': {
			type: 'string',
			description: nls.localize('aideChat.editor.fontFamily', "Controls the font family in chat codeblocks."),
			default: 'default'
		},
		'aideChat.editor.fontWeight': {
			type: 'string',
			description: nls.localize('aideChat.editor.fontWeight', "Controls the font weight in chat codeblocks."),
			default: 'default'
		},
		'aideChat.editor.wordWrap': {
			type: 'string',
			description: nls.localize('aideChat.editor.wordWrap', "Controls whether lines should wrap in chat codeblocks."),
			default: 'off',
			enum: ['on', 'off']
		},
		'aideChat.editor.lineHeight': {
			type: 'number',
			description: nls.localize('aideChat.editor.lineHeight', "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
			default: 0
		},
		'aideChat.experimental.implicitContext': {
			type: 'boolean',
			description: nls.localize('aideChat.experimental.implicitContext', "Controls whether a checkbox is shown to allow the user to determine which implicit context is included with a chat participant's prompt."),
			deprecated: true,
			default: false
		},
	}
});


Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		AideChatEditorInput.EditorID,
		nls.localize('aideChat', "Aide")
	),
	[
		new SyncDescriptor(AideChatEditorInput)
	]
);

class ChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeChatSesssion}:**/**`,
			{
				id: AideChatEditorInput.EditorID,
				label: nls.localize('aidehat', "Aide"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeChatSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(AideChatEditorInput, resource, options as IChatEditorOptions), options };
				}
			}
		));
	}
}

AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new ChatAccessibilityHelp());

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	constructor(
		@IAideChatSlashCommandService slashCommandService: IAideChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IAideChatAgentService chatAgentService: IAideChatAgentService,
		@IAideChatVariablesService chatVariablesService: IAideChatVariablesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Start a new chat"),
			sortText: 'z2_clear',
			executeImmediately: true
		}, async () => {
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true
		}, async (prompt, progress) => {
			const defaultAgent = chatAgentService.getDefaultAgent(AideChatAgentLocation.Panel);
			const agents = chatAgentService.getAgents();

			// Report prefix
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: 'markdownContent' });
				}
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
			}

			// Report agent list
			const agentText = (await Promise.all(agents
				.filter(a => a.id !== defaultAgent?.id)
				.filter(a => a.locations.includes(AideChatAgentLocation.Panel))
				.map(async a => {
					const description = a.description ? `- ${a.description}` : '';
					const agentMarkdown = instantiationService.invokeFunction(accessor => agentToMarkdown(a, true, accessor));
					const agentLine = `- ${agentMarkdown} ${description}`;
					const commandText = a.slashCommands.map(c => {
						const description = c.description ? `- ${c.description}` : '';
						return `\t* ${agentSlashCommandToMarkdown(a, c)} ${description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [SubmitAction.ID] } }), kind: 'markdownContent' });

			// Report variables
			if (defaultAgent?.metadata.helpTextVariablesPrefix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextVariablesPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextVariablesPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextVariablesPrefix), kind: 'markdownContent' });
				}

				const variables = [
					...chatVariablesService.getVariables(),
					{ name: 'file', description: nls.localize('file', "Choose a file in the workspace") }
				];
				const variableText = variables
					.map(v => `* \`${chatVariableLeader}${v.name}\` - ${v.description}`)
					.join('\n');
				progress.report({ content: new MarkdownString('\n' + variableText), kind: 'markdownContent' });
			}

			// Report help text ending
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: 'markdownContent' });
				}
			}
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatSlashStaticSlashCommandsContribution, LifecyclePhase.Eventually);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(AideChatEditorInput.TypeID, ChatEditorInputSerializer);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();

registerSingleton(IAideChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IAideChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IAideChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IAideChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(IAIModelsService, AIModelsService, InstantiationType.Delayed);
registerSingleton(IAIModelStatsService, AIModelStatsService, InstantiationType.Delayed);
registerSingleton(IAideChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IAideChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IAideChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IAideChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(IAideChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
