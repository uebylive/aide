/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import * as strings from '../../../../base/common/strings.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from '../../../../workbench/common/views.js';
import { CHAT_VIEW_ID } from '../../../../workbench/contrib/aideChat/browser/aideChat.js';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane } from '../../../../workbench/contrib/aideChat/browser/aideChatViewPane.js';
import { AideChatAgentLocation, IChatAgentData, IAideChatAgentService } from '../../../../workbench/contrib/aideChat/common/aideChatAgents.js';
import { IRawChatParticipantContribution } from '../../../../workbench/contrib/aideChat/common/aideChatParticipantContribTypes.js';
import { isProposedApiEnabled } from '../../../../workbench/services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../workbench/services/extensions/common/extensionsRegistry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatParticipantContribution[]>({
	extensionPoint: 'aideChatParticipants',
	jsonSchema: {
		description: localize('vscode.extension.contributes.aideChatParticipant', 'Contributes a chat participant'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['name', 'id'],
			properties: {
				id: {
					description: localize('aideChatParticipantId', "A unique id for this chat participant."),
					type: 'string'
				},
				name: {
					description: localize('aideChatParticipantName', "User-facing name for this chat participant. The user will use '@' with this name to invoke the participant. Name must not contain whitespace."),
					type: 'string',
					pattern: '^[\\w0-9_-]+$'
				},
				fullName: {
					markdownDescription: localize('aideChatParticipantFullName', "The full name of this chat participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", '`name`'),
					type: 'string'
				},
				description: {
					description: localize('aideChatParticipantDescription', "A description of this chat participant, shown in the UI."),
					type: 'string'
				},
				isSticky: {
					description: localize('aideChatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
					type: 'boolean'
				},
				sampleRequest: {
					description: localize('aideChatSampleRequest', "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
					type: 'string'
				},
				when: {
					description: localize('aideChatParticipantWhen', "A condition which must be true to enable this participant."),
					type: 'string'
				},
				commands: {
					markdownDescription: localize('aideChatCommandsDescription', "Commands available for this chat participant, which the user can invoke with a `/`."),
					type: 'array',
					items: {
						additionalProperties: false,
						type: 'object',
						defaultSnippets: [{ body: { name: '', description: '' } }],
						required: ['name'],
						properties: {
							name: {
								description: localize('aideChatCommand', "A short name by which this command is referred to in the UI, e.g. `fix` or * `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
								type: 'string'
							},
							description: {
								description: localize('aideChatCommandDescription', "A description of this command."),
								type: 'string'
							},
							when: {
								description: localize('aideChatCommandWhen', "A condition which must be true to enable this command."),
								type: 'string'
							},
							sampleRequest: {
								description: localize('aideChatCommandSampleRequest', "When the user clicks this command in `/help`, this text will be submitted to the participant."),
								type: 'string'
							},
							isSticky: {
								description: localize('aideChatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
								type: 'boolean'
							},
						}
					}
				},
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatParticipantContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onChatParticipant:${contrib.id}`);
		}
	},
});

export class ChatExtensionPointHandler implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.aideChatExtensionPointHandler';

	private _viewContainer: ViewContainer;
	private _participantRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IAideChatAgentService private readonly _chatAgentService: IAideChatAgentService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		this._viewContainer = this.registerViewContainer();
		this.handleAndRegisterChatExtensions();
	}

	private handleAndRegisterChatExtensions(): void {
		chatParticipantExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				// Detect old version of Copilot Chat extension.
				// TODO@roblourens remove after one release, after this we will rely on things like the API version
				if (extension.value.some(participant => participant.id === 'github.copilot.default' && !participant.fullName)) {
					this.notificationService.notify({
						severity: Severity.Error,
						message: localize('aideChatFailErrorMessage', "Chat failed to load. Please ensure that the GitHub Copilot Chat extension is up to date."),
						actions: {
							primary: [
								new Action('showExtension', localize('action.showExtension', "Show Extension"), undefined, true, () => {
									return this.commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', ['GitHub.copilot-chat']);
								})
							]
						}
					});
					continue;
				}

				for (const providerDescriptor of extension.value) {
					if (!providerDescriptor.name.match(/^[\w0-9_-]+$/)) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w0-9_-]+$/.`);
						continue;
					}

					if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					// Spaces are allowed but considered "invisible"
					if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ''))) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					if (providerDescriptor.isDefault && !isProposedApiEnabled(extension.description, 'defaultChatParticipant')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
						continue;
					}

					if ((providerDescriptor.defaultImplicitVariables || providerDescriptor.locations) && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
						continue;
					}

					if (!providerDescriptor.id || !providerDescriptor.name) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
						continue;
					}

					const store = new DisposableStore();
					if (providerDescriptor.isDefault && (!providerDescriptor.locations || providerDescriptor.locations?.includes(AideChatAgentLocation.Panel))) {
						store.add(this.registerDefaultParticipantView(providerDescriptor));
					}

					store.add(this._chatAgentService.registerAgent(
						providerDescriptor.id,
						{
							extensionId: extension.description.identifier,
							publisherDisplayName: extension.description.publisherDisplayName ?? extension.description.publisher, // May not be present in OSS
							extensionPublisherId: extension.description.publisher,
							extensionDisplayName: extension.description.displayName ?? extension.description.name,
							id: providerDescriptor.id,
							description: providerDescriptor.description,
							when: providerDescriptor.when,
							metadata: {
								isSticky: providerDescriptor.isSticky,
								sampleRequest: providerDescriptor.sampleRequest,
							},
							name: providerDescriptor.name,
							fullName: providerDescriptor.fullName,
							isDefault: providerDescriptor.isDefault,
							defaultImplicitVariables: providerDescriptor.defaultImplicitVariables,
							locations: isNonEmptyArray(providerDescriptor.locations) ?
								providerDescriptor.locations.map(AideChatAgentLocation.fromRaw) :
								[AideChatAgentLocation.Panel],
							slashCommands: providerDescriptor.commands ?? []
						} satisfies IChatAgentData));

					this._participantRegistrationDisposables.set(
						getParticipantKey(extension.description.identifier, providerDescriptor.id),
						store
					);
				}
			}

			for (const extension of delta.removed) {
				for (const providerDescriptor of extension.value) {
					this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.name));
				}
			}
		});
	}

	private registerViewContainer(): ViewContainer {
		// Register View Container
		const title = localize2('aideChat.viewContainer.label', "Chat");
		const icon = Codicon.commentDiscussion;
		const viewContainerId = CHAT_SIDEBAR_PANEL_ID;
		const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: viewContainerId,
			title,
			icon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [viewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: viewContainerId,
			hideIfEmpty: true,
			order: 100,
		}, ViewContainerLocation.Sidebar);

		return viewContainer;
	}

	private hasRegisteredDefaultParticipantView = false;
	private registerDefaultParticipantView(defaultParticipantDescriptor: IRawChatParticipantContribution): IDisposable {
		if (this.hasRegisteredDefaultParticipantView) {
			this.logService.warn(`Tried to register a second default chat participant view for "${defaultParticipantDescriptor.id}"`);
			return Disposable.None;
		}

		// Register View
		const name = defaultParticipantDescriptor.fullName ?? defaultParticipantDescriptor.name;
		const viewDescriptor: IViewDescriptor[] = [{
			id: CHAT_VIEW_ID,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			singleViewPaneContainerTitle: this._viewContainer.title.value,
			name: { value: name, original: name },
			canToggleVisibility: false,
			canMoveView: false,
			ctorDescriptor: new SyncDescriptor(ChatViewPane),
		}];
		this.hasRegisteredDefaultParticipantView = true;
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, this._viewContainer);

		return toDisposable(() => {
			this.hasRegisteredDefaultParticipantView = false;
			Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews(viewDescriptor, this._viewContainer);
		});
	}
}

function getParticipantKey(extensionId: ExtensionIdentifier, participantName: string): string {
	return `${extensionId.value}_${participantName}`;
}
