/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize, localize2 } from 'vs/nls';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { CHAT_VIEW_ID } from 'vs/workbench/contrib/aideChat/browser/aideChat';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane } from 'vs/workbench/contrib/aideChat/browser/aideChatViewPane';
import { AideChatAgentLocation, IChatAgentData, IAideChatAgentService } from 'vs/workbench/contrib/aideChat/common/aideChatAgents';
import { IRawChatParticipantContribution } from 'vs/workbench/contrib/aideChat/common/aideChatParticipantContribTypes';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';

const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatParticipantContribution[]>({
	extensionPoint: 'aideChatParticipants',
	jsonSchema: {
		description: localize('vscode.extension.contributes.aideChatParticipant', 'Contributes an Aide participant'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['name', 'id'],
			properties: {
				id: {
					description: localize('aideChatParticipantId', "A unique id for this aide participant."),
					type: 'string'
				},
				name: {
					description: localize('aideChatParticipantName', "User-facing name for this aide participant. The user will use '@' with this name to invoke the participant."),
					type: 'string',
					pattern: '^[\\w0-9_-]+$'
				},
				fullName: {
					markdownDescription: localize('aideChatParticipantFullName', "The full name of this aide participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", '`name`'),
					type: 'string'
				},
				description: {
					description: localize('aideChatParticipantDescription', "A description of this aide participant, shown in the UI."),
					type: 'string'
				},
				isSticky: {
					description: localize('aideChatCommandSticky', "Whether invoking the command puts the aide into a persistent mode, where the command is automatically added to the aide input for the next message."),
					type: 'boolean'
				},
				sampleRequest: {
					description: localize('aideChatSampleRequest', "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
					type: 'string'
				},
				commands: {
					markdownDescription: localize('aideChatCommandsDescription', "Commands available for this aide participant, which the user can invoke with a `/`."),
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
								description: localize('aideChatCommandSticky', "Whether invoking the command puts the aide into a persistent mode, where the command is automatically added to the aide input for the next message."),
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

	private readonly disposables = new DisposableStore();
	private _welcomeViewDescriptor?: IViewDescriptor;
	private _viewContainer: ViewContainer;
	private _participantRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IAideChatAgentService private readonly _chatAgentService: IAideChatAgentService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		this._viewContainer = this.registerViewContainer();
		this.registerListeners();
		this.handleAndRegisterChatExtensions();
	}

	private registerListeners() {
		this.contextService.onDidChangeContext(e => {

			if (!this.productService.chatWelcomeView) {
				return;
			}

			const showWelcomeViewConfigKey = 'workbench.chat.experimental.showWelcomeView';
			const keys = new Set([showWelcomeViewConfigKey]);
			if (e.affectsSome(keys)) {
				const contextKeyExpr = ContextKeyExpr.equals(showWelcomeViewConfigKey, true);
				const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
				if (this.contextService.contextMatchesRules(contextKeyExpr)) {
					this._welcomeViewDescriptor = {
						id: CHAT_VIEW_ID,
						name: { original: this.productService.chatWelcomeView.welcomeViewTitle, value: this.productService.chatWelcomeView.welcomeViewTitle },
						containerIcon: this._viewContainer.icon,
						ctorDescriptor: new SyncDescriptor(ChatViewPane),
						canToggleVisibility: false,
						canMoveView: true,
						order: 100
					};
					viewsRegistry.registerViews([this._welcomeViewDescriptor], this._viewContainer);

					viewsRegistry.registerViewWelcomeContent(CHAT_VIEW_ID, {
						content: this.productService.chatWelcomeView.welcomeViewContent,
					});
				} else if (this._welcomeViewDescriptor) {
					viewsRegistry.deregisterViews([this._welcomeViewDescriptor], this._viewContainer);
				}
			}
		}, null, this.disposables);
	}

	private handleAndRegisterChatExtensions(): void {
		chatParticipantExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				if (this.productService.quality === 'stable' && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
					this.logService.warn(`Chat participants are not yet enabled in VS Code Stable (${extension.description.identifier.value})`);
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

					if (providerDescriptor.when && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
						continue;
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
		const title = localize2('aideChat.viewContainer.label', "Aide");
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
		}, ViewContainerLocation.AuxiliaryBar);

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
			canMoveView: true,
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
