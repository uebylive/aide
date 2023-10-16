/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { getArcActionsForProvider } from 'vs/workbench/contrib/arc/browser/actions/arcActions';
import { IArcContributionService, IArcProviderContribution, IRawArcProviderContribution } from 'vs/workbench/contrib/arc/common/arcContributionService';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';


const chatExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawArcProviderContribution[]>({
	extensionPoint: 'arc',
	jsonSchema: {
		description: localize('vscode.extension.contributes.arc', 'Contributes an Arc provider'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { id: '', program: '', runtime: '' } }],
			required: ['id', 'label'],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.arc.id', "Unique identifier for this Interactive Session provider."),
					type: 'string'
				},
				label: {
					description: localize('vscode.extension.contributes.arc.label', "Display name for this Interactive Session provider."),
					type: 'string'
				},
				icon: {
					description: localize('vscode.extension.contributes.arc.icon', "An icon for this Interactive Session provider."),
					type: 'string'
				},
				when: {
					description: localize('vscode.extension.contributes.arc.when', "A condition which must be true to enable this Interactive Session provider."),
					type: 'string'
				},
			}
		}
	},
	activationEventsGenerator: (contributions: IRawArcProviderContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onArcSession:${contrib.id}`);
		}
	},
});

export class ArcExtensionPointHandler implements IWorkbenchContribution {
	private _registrationDisposables = new Map<string, IDisposable>();

	constructor(
		@IArcContributionService readonly _arcContributionService: IArcContributionService
	) {
		this.handleAndRegisterArcExtensions();
	}

	private handleAndRegisterArcExtensions(): void {
		chatExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionDisposable = new DisposableStore();
				for (const providerDescriptor of extension.value) {
					this.registerArcProvider(providerDescriptor);
					this._arcContributionService.registerArcProvider({
						...providerDescriptor,
					});
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
					this._arcContributionService.deregisterArcProvider(providerDescriptor.id);
				}
			}
		});
	}

	private registerArcProvider(providerDescriptor: IRawArcProviderContribution): IDisposable {
		const disposables = new DisposableStore();

		getArcActionsForProvider(providerDescriptor.id, providerDescriptor.label).map(action => disposables.add(registerAction2(action)));

		return {
			dispose: () => {
				disposables.dispose();
			}
		};
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ArcExtensionPointHandler, LifecyclePhase.Starting);


export class ArcContributionService implements IArcContributionService {
	declare _serviceBrand: undefined;

	private _registeredProviders = new Map<string, IArcProviderContribution>();

	constructor(
	) { }

	public getViewIdForProvider(providerId: string): string {
		return ChatViewPane.ID + '.' + providerId;
	}

	public registerArcProvider(provider: IArcProviderContribution): void {
		this._registeredProviders.set(provider.id, provider);
	}

	public deregisterArcProvider(providerId: string): void {
		this._registeredProviders.delete(providerId);
	}

	public get registeredProviders(): IArcProviderContribution[] {
		return Array.from(this._registeredProviders.values());
	}
}
