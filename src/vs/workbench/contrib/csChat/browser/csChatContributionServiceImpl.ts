/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { localize, localize2 } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { getHistoryAction, getOpenChatEditorAction } from 'vs/workbench/contrib/csChat/browser/actions/csChatActions';
import { getClearAction } from 'vs/workbench/contrib/csChat/browser/actions/csChatClearActions';
import { getHoverActionsForProvider } from 'vs/workbench/contrib/csChat/browser/actions/csChatHoverActions';
import { getMoveToEditorAction, getMoveToNewWindowAction } from 'vs/workbench/contrib/csChat/browser/actions/csChatMoveActions';
import { getQuickChatActionForProvider } from 'vs/workbench/contrib/csChat/browser/actions/csChatQuickInputActions';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane, IChatViewOptions } from 'vs/workbench/contrib/csChat/browser/csChatViewPane';
import { ICSChatContributionService, IChatProviderContribution, IRawChatProviderContribution } from 'vs/workbench/contrib/csChat/common/csChatContributionService';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';


const chatExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatProviderContribution[]>({
	extensionPoint: 'csChatSession',
	jsonSchema: {
		description: localize('vscode.extension.contributes.csChatSession', 'Contributes a CS Chat Session provider'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { id: '', program: '', runtime: '' } }],
			required: ['id', 'label'],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.csChatSession.id', "Unique identifier for this CS Chat Session provider."),
					type: 'string'
				},
				label: {
					description: localize('vscode.extension.contributes.csChatSession.label', "Display name for this CS Chat Session provider."),
					type: 'string'
				},
				icon: {
					description: localize('vscode.extension.contributes.csChatSession.icon', "An icon for this CS Chat Session provider."),
					type: 'string'
				},
				when: {
					description: localize('vscode.extension.contributes.csChatSession.when', "A condition which must be true to enable this CS Chat Session provider."),
					type: 'string'
				},
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatProviderContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onCSChatSession:${contrib.id}`);
		}
	},
});

export class ChatExtensionPointHandler implements IWorkbenchContribution {

	private _viewContainer: ViewContainer;
	private _registrationDisposables = new Map<string, IDisposable>();

	constructor(
		@ICSChatContributionService readonly _chatContributionService: ICSChatContributionService
	) {
		this._viewContainer = this.registerViewContainer();
		this.handleAndRegisterChatExtensions();
	}

	private handleAndRegisterChatExtensions(): void {
		chatExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionDisposable = new DisposableStore();
				for (const providerDescriptor of extension.value) {
					this.registerChatProvider(providerDescriptor);
					this._chatContributionService.registerChatProvider(providerDescriptor);
				}
				this._registrationDisposables.set(extension.description.identifier.value, extensionDisposable);
			}

			for (const extension of delta.removed) {
				const registration = this._registrationDisposables.get(extension.description.identifier.value);
				if (registration) {
					registration.dispose();
					this._registrationDisposables.delete(extension.description.identifier.value);
				}

				for (const providerDescriptor of extension.value) {
					this._chatContributionService.deregisterChatProvider(providerDescriptor.id);
				}
			}
		});
	}

	private registerViewContainer(): ViewContainer {
		// Register View Container
		const title = localize2('chat.viewContainer.label', "Chat");
		const icon = FileAccess.asBrowserUri('vs/workbench/contrib/csChat/browser/media/aide-white.svg');
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

	private registerChatProvider(providerDescriptor: IRawChatProviderContribution): IDisposable {
		// Register View
		const viewId = this._chatContributionService.getViewIdForProvider(providerDescriptor.id);
		const viewDescriptor: IViewDescriptor[] = [{
			id: viewId,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			name: { value: providerDescriptor.label, original: providerDescriptor.label },
			canToggleVisibility: false,
			canMoveView: true,
			ctorDescriptor: new SyncDescriptor(ChatViewPane, [<IChatViewOptions>{ providerId: providerDescriptor.id }]),
			when: ContextKeyExpr.deserialize(providerDescriptor.when)
		}];
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, this._viewContainer);

		// Per-provider actions

		// Actions in view title
		const disposables = new DisposableStore();
		disposables.add(registerAction2(getHistoryAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getClearAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getMoveToEditorAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getMoveToNewWindowAction(viewId, providerDescriptor.id)));

		// "Open Chat" Actions
		disposables.add(registerAction2(getOpenChatEditorAction(providerDescriptor.id, providerDescriptor.label, providerDescriptor.when)));
		disposables.add(registerAction2(getQuickChatActionForProvider(providerDescriptor.id, providerDescriptor.label)));

		// Hover Chat Actions
		getHoverActionsForProvider(providerDescriptor.id, providerDescriptor.label).map(action => disposables.add(registerAction2(action)));

		return {
			dispose: () => {
				Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews(viewDescriptor, this._viewContainer);
				Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).deregisterViewContainer(this._viewContainer);
				disposables.dispose();
			}
		};
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ChatExtensionPointHandler, LifecyclePhase.Starting);


export class ChatContributionService implements ICSChatContributionService {
	declare _serviceBrand: undefined;

	private _registeredProviders = new Map<string, IChatProviderContribution>();

	constructor(
	) { }

	public getViewIdForProvider(providerId: string): string {
		return ChatViewPane.ID + '.' + providerId;
	}

	public registerChatProvider(provider: IChatProviderContribution): void {
		this._registeredProviders.set(provider.id, provider);
	}

	public deregisterChatProvider(providerId: string): void {
		this._registeredProviders.delete(providerId);
	}

	public get registeredProviders(): IChatProviderContribution[] {
		return Array.from(this._registeredProviders.values());
	}
}
