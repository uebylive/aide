/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export type ProviderType = 'openai-default' | 'azure-openai' | 'togetherai' | 'ollama';
export const providerTypeValues: ProviderType[] = ['openai-default', 'azure-openai', 'togetherai', 'ollama'];

export const humanReadableProviderConfigKey: Record<string, string> = {
	'apiKey': 'API Key',
	'apiBase': 'Base URL'
};

export interface ILanguageModelItem {
	readonly name: string;
	readonly contextLength: number;
	readonly temperature: number;
	readonly provider: ProviderType;
}

export function isLanguageModelItem(obj: any): obj is ILanguageModelItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& ('contextLength' in obj ? typeof obj['contextLength'] === 'number' : true)
		&& ('temperature' in obj ? typeof obj['temperature'] === 'number' : true)
		&& ('provider' in obj ? typeof obj['provider'] === 'string' : true);
}

export interface OpenAIProviderConfig {
	readonly name: 'OpenAI';
	readonly apiKey?: string;
}

export interface AzureOpenAIProviderConfig {
	readonly name: 'Azure OpenAI';
	readonly apiBase: string;
	readonly apiKey: string;
}

export interface TogetherAIProviderConfig {
	readonly name: 'Together AI';
	readonly apiKey: string;
}

export interface OllamaProviderConfig {
	readonly name: 'Ollama';
}

export type ProviderConfig = OpenAIProviderConfig | AzureOpenAIProviderConfig | TogetherAIProviderConfig | OllamaProviderConfig;

export type IModelProviders =
	{ 'openai-default': OpenAIProviderConfig }
	| { 'azure-openai': AzureOpenAIProviderConfig }
	| { 'togetherai': TogetherAIProviderConfig }
	| { 'ollama': OllamaProviderConfig };

export function isModelProviderItem(obj: any): obj is IModelProviders {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& ('apiKey' in obj ? typeof obj['apiKey'] === 'string' : true)
		&& ('apiBase' in obj ? typeof obj['apiBase'] === 'string' : true);
}

export interface IModelSelectionSettings {
	readonly slowModel: string;
	readonly fastModel: string;
	readonly models: Record<string, ILanguageModelItem>;
	readonly providers: IModelProviders;
}

export function isModelSelectionSettings(obj: any): obj is IModelSelectionSettings {
	return obj && typeof obj === 'object'
		&& ('slowModel' in obj ? typeof obj['slowModel'] === 'string' : true)
		&& ('fastModel' in obj ? typeof obj['fastModel'] === 'string' : true)
		&& ('models' in obj ? Object.keys(obj['models']).every(key => isLanguageModelItem(obj['models'][key])) : true)
		&& ('providers' in obj ? Object.keys(obj['providers']).every(key => isModelProviderItem(obj['providers'][key])) : true);
}

export const IAIModelSelectionService = createDecorator<IAIModelSelectionService>('aiModelSelectionService');
export interface IAIModelSelectionService {
	readonly _serviceBrand: undefined;

	onDidChangeModelSelection: Event<IModelSelectionSettings>;

	getDefaultModelSelectionContent(): string;
	getModelSelectionSettings(): Promise<IModelSelectionSettings>;
}

export const defaultModelSelectionSettings: IModelSelectionSettings = {
	slowModel: 'GPT3_5_16k',
	fastModel: 'Gpt4',
	models: {
		'Gpt4Turbo': {
			name: 'GPT-4 Turbo',
			contextLength: 128000,
			temperature: 0.2,
			provider: 'openai-default'
		},
		'Gpt4_32k': {
			name: 'GPT-4 32k',
			contextLength: 32768,
			temperature: 0.2,
			provider: 'openai-default'
		},
		'Gpt4': {
			name: 'GPT-4',
			contextLength: 8192,
			temperature: 0.2,
			provider: 'openai-default'
		},
		'GPT3_5_16k': {
			name: 'GPT-3.5 Turbo 16k',
			contextLength: 16385,
			temperature: 0.2,
			provider: 'openai-default'
		},
		'GPT3_5': {
			name: 'GPT-3.5 Turbo',
			contextLength: 4096,
			temperature: 0.2,
			provider: 'openai-default'
		},
		'Mixtral': {
			name: 'Mixtral',
			contextLength: 32000,
			temperature: 0.2,
			provider: 'togetherai'
		},
		'MistralInstruct': {
			name: 'Mistral 7B Instruct',
			contextLength: 8000,
			temperature: 0.2,
			provider: 'togetherai'
		},
	},
	providers: {
		'openai-default': {
			name: 'OpenAI',
			apiKey: '',
		},
		'azure-openai': {
			name: 'Azure OpenAI',
			apiBase: '',
			apiKey: '',
		},
		'togetherai': {
			name: 'Together AI',
			apiKey: '',
		},
		'ollama': {
			name: 'Ollama'
		}
	}
};
