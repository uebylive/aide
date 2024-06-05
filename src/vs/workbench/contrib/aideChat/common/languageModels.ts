/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress } from 'vs/platform/progress/common/progress';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IAideChatMessage {
	readonly role: ChatMessageRole;
	readonly content: string;
}

export interface IAideChatResponseFragment {
	index: number;
	part: string;
}

export interface IAIModelChatMetadata {
	readonly extension: ExtensionIdentifier;

	readonly name: string;
	readonly id: string;
	readonly vendor: string;
	readonly version: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly targetExtensions?: string[];

	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
}

export interface ILanguageModelChat {
	metadata: IAIModelChatMetadata;
	provideChatResponse(messages: IAideChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, progress: IProgress<IAideChatResponseFragment>, token: CancellationToken): Promise<any>;
	provideTokenCount(message: string | IAideChatMessage, token: CancellationToken): Promise<number>;
}

export interface ILanguageModelAideChatSelector {
	readonly name?: string;
	readonly identifier?: string;
	readonly vendor?: string;
	readonly version?: string;
	readonly family?: string;
	readonly tokens?: number;
	readonly extension?: ExtensionIdentifier;
}

export const IAIModelsService = createDecorator<IAIModelsService>('IAIModelsService');

export interface ILanguageModelsChangeEvent {
	added?: {
		identifier: string;
		metadata: IAIModelChatMetadata;
	}[];
	removed?: string[];
}

export interface IAIModelsService {

	readonly _serviceBrand: undefined;

	onDidChangeLanguageModels: Event<ILanguageModelsChangeEvent>;

	getLanguageModelIds(): string[];

	lookupLanguageModel(identifier: string): IAIModelChatMetadata | undefined;

	selectLanguageModels(selector: ILanguageModelAideChatSelector): Promise<string[]>;

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable;

	makeLanguageModelChatRequest(identifier: string, from: ExtensionIdentifier, messages: IAideChatMessage[], options: { [name: string]: any }, progress: IProgress<IAideChatResponseFragment>, token: CancellationToken): Promise<any>;

	computeTokenLength(identifier: string, message: string | IAideChatMessage, token: CancellationToken): Promise<number>;
}

const languageModelType: IJSONSchema = {
	type: 'object',
	properties: {
		vendor: {
			type: 'string',
			description: localize('vscode.extension.contributes.aiModels.vendor', "A globally unique vendor of AI models.")
		}
	}
};

interface IUserFriendlyLanguageModel {
	vendor: string;
}

export const languageModelExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyLanguageModel | IUserFriendlyLanguageModel[]>({
	extensionPoint: 'aiModels',
	jsonSchema: {
		description: localize('vscode.extension.contributes.aiModels', "Contribute AI models of a specific vendor."),
		oneOf: [
			languageModelType,
			{
				type: 'array',
				items: languageModelType
			}
		]
	},
	activationEventsGenerator: (contribs: IUserFriendlyLanguageModel[], result: { push(item: string): void }) => {
		for (const contrib of contribs) {
			result.push(`onLanguageModelChat:${contrib.vendor}`);
		}
	}
});

export class AIModelsService implements IAIModelsService {

	readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ILanguageModelChat>();
	private readonly _vendors = new Set<string>();

	private readonly _onDidChangeProviders = new Emitter<ILanguageModelsChangeEvent>();
	readonly onDidChangeLanguageModels: Event<ILanguageModelsChangeEvent> = this._onDidChangeProviders.event;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {

		languageModelExtensionPoint.setHandler((extensions) => {

			this._vendors.clear();

			for (const extension of extensions) {

				if (!isProposedApiEnabled(extension.description, 'aideChatProvider')) {
					extension.collector.error(localize('vscode.extension.contributes.aiModels.aideChatProviderRequired', "This contribution point requires the 'aideChatProvider' proposal."));
					continue;
				}

				for (const item of Iterable.wrap(extension.value)) {
					if (this._vendors.has(item.vendor)) {
						extension.collector.error(localize('vscode.extension.contributes.aiModels.vendorAlreadyRegistered', "The vendor '{0}' is already registered and cannot be registered twice", item.vendor));
						continue;
					}
					if (isFalsyOrWhitespace(item.vendor)) {
						extension.collector.error(localize('vscode.extension.contributes.aiModels.emptyVendor', "The vendor field cannot be empty."));
						continue;
					}
					if (item.vendor.trim() !== item.vendor) {
						extension.collector.error(localize('vscode.extension.contributes.aiModels.whitespaceVendor', "The vendor field cannot start or end with whitespace."));
						continue;
					}
					this._vendors.add(item.vendor);
				}
			}

			const removed: string[] = [];
			for (const [identifier, value] of this._providers) {
				if (!this._vendors.has(value.metadata.vendor)) {
					this._providers.delete(identifier);
					removed.push(identifier);
				}
			}
			if (removed.length > 0) {
				this._onDidChangeProviders.fire({ removed });
			}
		});
	}

	dispose() {
		this._onDidChangeProviders.dispose();
		this._providers.clear();
	}

	getLanguageModelIds(): string[] {
		return Array.from(this._providers.keys());
	}

	lookupLanguageModel(identifier: string): IAIModelChatMetadata | undefined {
		return this._providers.get(identifier)?.metadata;
	}

	async selectLanguageModels(selector: ILanguageModelAideChatSelector): Promise<string[]> {

		if (selector.vendor) {
			// selective activation
			await this._extensionService.activateByEvent(`onLanguageModelChat:${selector.vendor}}`);
		} else {
			// activate all extensions that do AI models
			const all = Array.from(this._vendors).map(vendor => this._extensionService.activateByEvent(`onLanguageModelChat:${vendor}`));
			await Promise.all(all);
		}

		const result: string[] = [];

		for (const [identifier, model] of this._providers) {

			if (selector.vendor !== undefined && model.metadata.vendor === selector.vendor
				|| selector.family !== undefined && model.metadata.family === selector.family
				|| selector.version !== undefined && model.metadata.version === selector.version
				|| selector.identifier !== undefined && model.metadata.id === selector.identifier
				|| selector.extension !== undefined && model.metadata.targetExtensions?.some(candidate => ExtensionIdentifier.equals(candidate, selector.extension))
			) {
				// true selection
				result.push(identifier);

			} else if (!selector || (
				selector.vendor === undefined
				&& selector.family === undefined
				&& selector.version === undefined
				&& selector.identifier === undefined)
			) {
				// no selection
				result.push(identifier);
			}
		}

		this._logService.trace('[LM] selected AI models', selector, result);

		return result;
	}

	registerLanguageModelChat(identifier: string, provider: ILanguageModelChat): IDisposable {

		this._logService.trace('[LM] registering AI model chat', identifier, provider.metadata);

		if (!this._vendors.has(provider.metadata.vendor)) {
			throw new Error(`Chat response provider uses UNKNOWN vendor ${provider.metadata.vendor}.`);
		}
		if (this._providers.has(identifier)) {
			throw new Error(`Chat response provider with identifier ${identifier} is already registered.`);
		}
		this._providers.set(identifier, provider);
		this._onDidChangeProviders.fire({ added: [{ identifier, metadata: provider.metadata }] });
		return toDisposable(() => {
			if (this._providers.delete(identifier)) {
				this._onDidChangeProviders.fire({ removed: [identifier] });
				this._logService.trace('[LM] UNregistered AI model chat', identifier, provider.metadata);
			}
		});
	}

	makeLanguageModelChatRequest(identifier: string, from: ExtensionIdentifier, messages: IAideChatMessage[], options: { [name: string]: any }, progress: IProgress<IAideChatResponseFragment>, token: CancellationToken): Promise<any> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideChatResponse(messages, from, options, progress, token);
	}

	computeTokenLength(identifier: string, message: string | IAideChatMessage, token: CancellationToken): Promise<number> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideTokenCount(message, token);
	}
}
