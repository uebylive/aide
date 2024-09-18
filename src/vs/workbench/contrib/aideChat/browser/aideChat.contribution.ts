/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { registerChatActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatActions.js';
import { ACTION_ID_NEW_CHAT, registerNewChatActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatClearActions.js';
import { registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatCodeblockActions.js';
//import { registerChatContextActions } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatContextActions';
import { registerChatCopyActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatCopyActions.js';
import { registerChatDeveloperActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatDeveloperActions.js';
import { SubmitAction, registerChatExecuteActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatExecuteActions.js';
import { registerChatFileTreeActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatFileTreeActions.js';
import { registerChatExportActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatImportExport.js';
import { registerMoveActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatMoveActions.js';
import { registerQuickChatActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatQuickInputActions.js';
import { registerChatTitleActions } from '../../../../workbench/contrib/aideChat/browser/actions/aideChatTitleActions.js';
import { IAideChatAccessibilityService, IAideChatCodeBlockContextProviderService, IAideChatWidgetService, IQuickChatService } from '../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { ChatAccessibilityService } from '../../../../workbench/contrib/aideChat/browser/aideChatAccessibilityService.js';
import { ChatEditor, IChatEditorOptions } from '../../../../workbench/contrib/aideChat/browser/aideChatEditor.js';
import { AideChatEditorInput, ChatEditorInputSerializer } from '../../../../workbench/contrib/aideChat/browser/aideChatEditorInput.js';
import { agentSlashCommandToMarkdown, agentToMarkdown } from '../../../../workbench/contrib/aideChat/browser/aideChatMarkdownDecorationsRenderer.js';
import { ChatExtensionPointHandler } from '../../../../workbench/contrib/aideChat/browser/aideChatParticipantContributions.js';
import { QuickChatService } from '../../../../workbench/contrib/aideChat/browser/aideChatQuick.js';
import { ChatVariablesService } from '../../../../workbench/contrib/aideChat/browser/aideChatVariables.js';
import { ChatWidgetService } from '../../../../workbench/contrib/aideChat/browser/aideChatWidget.js';
import { KeybindingPillWidget } from '../../../../workbench/contrib/aideChat/browser/aideKeybindingPill.js';
import { ChatCodeBlockContextProviderService } from '../../../../workbench/contrib/aideChat/browser/codeBlockContextProviderService.js';
import '../../../../workbench/contrib/aideChat/browser/contrib/aideChatContextAttachments.js';
import '../../../../workbench/contrib/aideChat/browser/contrib/aideChatInputCompletions.js';
import '../../../../workbench/contrib/aideChat/browser/contrib/aideChatInputEditorContrib.js';
import '../../../../workbench/contrib/aideChat/browser/contrib/aideChatInputEditorHover.js';
import { AideChatAgentLocation, ChatAgentNameService, ChatAgentService, IAideChatAgentNameService, IAideChatAgentService } from '../../../../workbench/contrib/aideChat/common/aideChatAgents.js';
import { chatVariableLeader } from '../../../../workbench/contrib/aideChat/common/aideChatParserTypes.js';
import { IAideChatService } from '../../../../workbench/contrib/aideChat/common/aideChatService.js';
import { ChatService } from '../../../../workbench/contrib/aideChat/common/aideChatServiceImpl.js';
import { ChatSlashCommandService, IAideChatSlashCommandService } from '../../../../workbench/contrib/aideChat/common/aideChatSlashCommands.js';
import { IAideChatVariablesService } from '../../../../workbench/contrib/aideChat/common/aideChatVariables.js';
import { ChatWidgetHistoryService, IAideChatWidgetHistoryService } from '../../../../workbench/contrib/aideChat/common/aideChatWidgetHistoryService.js';
import { ILanguageModelsService, LanguageModelsService } from '../../../../workbench/contrib/aideChat/common/languageModels.js';
import { ILanguageModelStatsService, LanguageModelStatsService } from '../../../../workbench/contrib/aideChat/common/languageModelStats.js';
import { ILanguageModelToolsService, LanguageModelToolsService } from '../../../../workbench/contrib/aideChat/common/languageModelToolsService.js';
import { LanguageModelToolsExtensionPointHandler } from '../../../../workbench/contrib/aideChat/common/tools/languageModelToolsContribution.js';
import { IVoiceChatService, VoiceChatService } from '../../../../workbench/contrib/aideChat/common/voiceChatService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../workbench/services/editor/common/editorResolverService.js';
import { LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import '../common/aideChatColors.js';
import { KeybindingPillContribution } from '../../../../workbench/contrib/aideChat/browser/contrib/aideChatKeybindingPillContrib.js';

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
			default: isMacintosh ? 14 : 14,
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
		'aideChat.experimental.variables.editor': {
			type: 'boolean',
			description: nls.localize('aideChat.experimental.variables.editor', "Enables variables for editor chat."),
			default: false
		},
		'aideChat.experimental.variables.notebook': {
			type: 'boolean',
			description: nls.localize('aideChat.experimental.variables.notebook', "Enables variables for notebook chat."),
			default: false
		},
		'aideChat.experimental.variables.terminal': {
			type: 'boolean',
			description: nls.localize('aideChat.experimental.variables.terminal', "Enables variables for terminal chat."),
			default: false
		},
	}
});
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		AideChatEditorInput.EditorID,
		nls.localize('aideChat', "Chat")
	),
	[
		new SyncDescriptor(AideChatEditorInput)
	]
);

class ChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.aideChatResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeChatSesssion}:**/**`,
			{
				id: AideChatEditorInput.EditorID,
				label: nls.localize('aideChat', "Chat"),
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

registerEditorContribution(KeybindingPillContribution.ID, KeybindingPillContribution, EditorContributionInstantiation.Eventually);
registerEditorContribution(KeybindingPillWidget.ID, KeybindingPillWidget, EditorContributionInstantiation.Lazy);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.Eventually);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();
//registerChatContextActions();
registerChatDeveloperActions();

registerSingleton(IAideChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IAideChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IAideChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IAideChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IAideChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IAideChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IAideChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IAideChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IAideChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
