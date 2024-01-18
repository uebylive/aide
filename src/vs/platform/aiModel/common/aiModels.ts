/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ILanguageModelItem {
	readonly name: string;
	readonly contextLength: number;
	readonly temperature: number;
	readonly provider: string;
}

export function isLanguageModelItem(obj: any): obj is ILanguageModelItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& 'contextLength' in obj && typeof obj['contextLength'] === 'number'
		&& 'temperature' in obj && typeof obj['temperature'] === 'number'
		&& 'provider' in obj && typeof obj['provider'] === 'string';
}

export interface IModelProviderItem {
	readonly name: string;
	readonly baseURL?: string;
	readonly apiKey?: string | null;
}

export function isModelProviderItem(obj: any): obj is IModelProviderItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& ('baseURL' in obj ? typeof obj['baseURL'] === 'string' : true)
		&& ('apiKey' in obj ? typeof obj['apiKey'] === 'string' || typeof obj['apiKey'] === 'undefined' : true);
}

export interface IModelSelectionSettings {
	readonly slowModel: string;
	readonly fastModel: string;
	readonly models: Record<string, ILanguageModelItem>;
	readonly providers: Record<string, IModelProviderItem>;
}

export function isModelSelectionSettings(obj: any): obj is IModelSelectionSettings {
	return obj && typeof obj === 'object'
		&& ('slowModel' in obj ? typeof obj['slowModel'] === 'string' : true)
		&& ('fastModel' in obj ? typeof obj['fastModel'] === 'string' : true)
		&& ('models' in obj ? isModelProviderItem(obj['models']) : true)
		&& ('providers' in obj ? isModelProviderItem(obj['providers']) : true);
}

export const IAIModelSelectionService = createDecorator<IAIModelSelectionService>('aiModelSelectionService');
export interface IAIModelSelectionService {
	readonly _serviceBrand: undefined;

	onDidChangeModelSelection: Event<IModelSelectionSettings>;

	getDefaultModelSelectionContent(): string;
	getModelSelectionSettings(): IModelSelectionSettings;
}

export const defaultModelSelectionSettings: IModelSelectionSettings = {
	slowModel: 'gpt-4-32k',
	fastModel: 'gpt-3.5-turbo',
	models: {
		'inline-chat-edit-lora-v0.0': {
			name: 'CodeStory (Mistral 7B fine-tuned)',
			contextLength: 8192,
			temperature: 0.2,
			provider: 'Ollama'
		},
		'GPT3_5_16k': {
			name: 'GPT-3.5',
			contextLength: 4096,
			temperature: 0.2,
			provider: 'OpenAI'
		},
		'Gpt4': {
			name: 'GPT-4',
			contextLength: 8192,
			temperature: 0.2,
			provider: 'OpenAI',
		},
		'Gpt4_32k': {
			name: 'GPT-4 32k',
			contextLength: 32768,
			temperature: 0.2,
			provider: 'OpenAI'
		},
		'Gpt4Turbo': {
			name: 'GPT-4 Turbo',
			contextLength: 128000,
			temperature: 0.2,
			provider: 'OpenAI'
		},
		'Mixtral': {
			name: 'Mixtral',
			contextLength: 32000,
			temperature: 0.2,
			provider: 'TogetherAI',
		},
		'MistralInstruct': {
			name: 'MistralInstruct',
			contextLength: 8000,
			temperature: 0.2,
			provider: 'TogetherAI',
		},
	},
	providers: {
		'openai-default': {
			name: 'OpenAI',
			apiKey: undefined
		},
		'ollama': {
			name: 'Ollama',
			apiKey: null
		},
		'lmstudio': {
			name: 'LM Studio',
			apiKey: null
		},
		'togetherai': {
			name: 'Together AI',
			apiKey: undefined
		}
	}
};
