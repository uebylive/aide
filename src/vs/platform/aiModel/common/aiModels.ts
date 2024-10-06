/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const humanReadableModelConfigKey: Record<string, string> = {
	'contextLength': 'Context Length',
	'temperature': 'Temperature',
	'deploymentID': 'Deployment ID'
};

export const humanReadableProviderConfigKey: Record<string, string> = {
	'apiKey': 'API Key',
	'apiBase': 'Base URL'
};

export type ProviderType = 'codestory' | 'openai-default' | 'azure-openai' | 'togetherai' | 'ollama' | 'openai-compatible' | 'anthropic' | 'fireworkai' | 'geminipro' | 'open-router';
export const providerTypeValues: ProviderType[] = ['codestory', 'openai-default', 'azure-openai', 'togetherai', 'ollama', 'openai-compatible', 'anthropic', 'fireworkai', 'geminipro', 'open-router'];

export interface AzureOpenAIModelProviderConfig {
	readonly type: 'azure-openai';
	readonly deploymentID: string;
}

export interface GenericModelProviderConfig {
	readonly type: Exclude<ProviderType, 'azure-openai'>;
}

export type ModelProviderConfig = AzureOpenAIModelProviderConfig | GenericModelProviderConfig;

export function isModelProviderConfig(obj: any): obj is ModelProviderConfig {
	return obj && typeof obj === 'object'
		&& 'type' in obj && typeof obj['type'] === 'string'
		&& ('deploymentID' in obj ? typeof obj['deploymentID'] === 'string' : true);
}

export interface ILanguageModelItem {
	readonly name: string;
	readonly contextLength: number;
	readonly temperature: number;
	readonly provider: ModelProviderConfig;
}

export function isLanguageModelItem(obj: any): obj is ILanguageModelItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& ('contextLength' in obj ? typeof obj['contextLength'] === 'number' : true)
		&& ('temperature' in obj ? typeof obj['temperature'] === 'number' : true)
		&& ('provider' in obj ? isModelProviderConfig(obj['provider']) : true);
}

export interface CodeStoryProviderConfig {
	readonly name: 'CodeStory';
}

export interface OpenAIProviderConfig {
	readonly name: 'OpenAI';
	readonly apiKey?: string;
}

export interface BaseOpenAICompatibleProviderConfig {
	readonly apiKey: string;
	readonly apiBase: string;
}

export interface OpenAICompatibleProviderConfig extends BaseOpenAICompatibleProviderConfig {
	readonly name: 'OpenAI Compatible';
}

export interface AzureOpenAIProviderConfig extends BaseOpenAICompatibleProviderConfig {
	readonly name: 'Azure OpenAI';
}

export interface TogetherAIProviderConfig {
	readonly name: 'Together AI';
	readonly apiKey: string;
}

export interface OllamaProviderConfig {
	readonly name: 'Ollama';
}

export interface AnthropicProviderConfig {
	readonly name: 'Anthropic';
	readonly apiKey: string;
}

export interface FireworkAIProviderConfig {
	readonly name: 'Firework AI';
	readonly apiKey: string;
}

export interface OpenRouterAIProviderConfig {
	readonly name: 'Open Router';
	readonly apiKey: string;
}

export interface GeminiProProviderConfig {
	readonly name: 'GeminiPro';
	readonly apiKey: string;
	readonly apiBase: string;
}

export type ProviderConfig = CodeStoryProviderConfig | OpenAIProviderConfig | AzureOpenAIProviderConfig | TogetherAIProviderConfig | OpenAICompatibleProviderConfig | OllamaProviderConfig | AnthropicProviderConfig | FireworkAIProviderConfig | GeminiProProviderConfig | OpenRouterAIProviderConfig;
export type ProviderConfigsWithAPIKey = Exclude<ProviderConfig, CodeStoryProviderConfig | OllamaProviderConfig>;

export type IModelProviders =
	{ 'codestory': CodeStoryProviderConfig }
	| { 'openai-default': OpenAIProviderConfig }
	| { 'azure-openai': AzureOpenAIProviderConfig }
	| { 'togetherai': TogetherAIProviderConfig }
	| { 'openai-compatible': OpenAICompatibleProviderConfig }
	| { 'ollama': OllamaProviderConfig }
	| { 'anthropic': AnthropicProviderConfig }
	| { 'fireworkai': FireworkAIProviderConfig }
	| { 'geminipro': GeminiProProviderConfig }
	| { 'open-router': OpenRouterAIProviderConfig };

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
	getValidatedModelSelectionSettings(): Promise<IModelSelectionSettings>;
}

export const defaultModelSelectionSettings: IModelSelectionSettings = {
	slowModel: 'ClaudeSonnet',
	fastModel: 'DeepSeekCoder33BInstruct',
	models: {
		'o1-mini': {
			name: 'o1-mini reasoning',
			contextLength: 128000,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'o1-preview': {
			name: 'o1-preview reasoning',
			contextLength: 128000,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'Gpt4': {
			name: 'GPT-4',
			contextLength: 8192,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'GPT3_5_16k': {
			name: 'GPT-3.5 Turbo 16k',
			contextLength: 16385,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'Gpt4Turbo': {
			name: 'GPT-4 Turbo',
			contextLength: 128000,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'Gpt4_32k': {
			name: 'GPT-4 32k',
			contextLength: 32768,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'Gpt4O': {
			name: 'Gpt4-o',
			contextLength: 128000,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'GPT3_5': {
			name: 'GPT-3.5 Turbo',
			contextLength: 4096,
			temperature: 0.2,
			provider: {
				type: 'openai-default'
			}
		},
		'Mixtral': {
			name: 'Mixtral',
			contextLength: 32000,
			temperature: 0.2,
			provider: {
				type: 'togetherai'
			}
		},
		'MistralInstruct': {
			name: 'Mistral 7B Instruct',
			contextLength: 8000,
			temperature: 0.2,
			provider: {
				type: 'togetherai'
			}
		},
		'CodeLlama13BInstruct': {
			name: 'CodeLlama 13B Instruct',
			contextLength: 16384,
			temperature: 0.2,
			provider: {
				type: 'togetherai'
			}
		},
		'CodeLlama7BInstruct': {
			name: 'CodeLlama 7B Instruct',
			contextLength: 16384,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'DeepSeekCoder33BInstruct': {
			name: 'DeepSeekCoder 33B Instruct',
			contextLength: 16384,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'DeepSeekCoder1.3BInstruct': {
			name: 'DeepSeekCoder 1.3B Instruct',
			contextLength: 16384,
			temperature: 0.2,
			provider: {
				type: 'ollama'
			}
		},
		'DeepSeekCoderV2': {
			name: 'DeepSeekCoder V2',
			contextLength: 128000,
			temperature: 0.2,
			provider: {
				type: 'open-router'
			}
		},
		'DeepSeekCoder6BInstruct': {
			name: 'DeepSeekCoder 6B Instruct',
			contextLength: 16384,
			temperature: 0.2,
			provider: {
				type: 'ollama'
			}
		},
		'ClaudeOpus': {
			name: 'Claude Opus',
			contextLength: 200000,
			temperature: 0.2,
			provider: {
				type: 'anthropic'
			}
		},
		'ClaudeSonnet': {
			name: 'Claude Sonnet',
			contextLength: 200000,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'ClaudeHaiku': {
			name: 'Claude Haiku',
			contextLength: 200000,
			temperature: 0.2,
			provider: {
				type: 'codestory'
			}
		},
		'GeminiPro1.5': {
			name: 'Gemini Pro 1.5',
			contextLength: 1000000,
			temperature: 0.2,
			provider: {
				type: 'geminipro',
			}
		},
	},
	providers: {
		'codestory': {
			name: 'CodeStory'
		},
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
		'openai-compatible': {
			name: 'OpenAI Compatible',
			apiBase: '',
			apiKey: '',
		},
		'ollama': {
			name: 'Ollama'
		},
		'anthropic': {
			name: 'Anthropic',
			apiKey: '',
		},
		'fireworkai': {
			name: 'Firework AI',
			apiKey: '',
		},
		'geminipro': {
			name: 'GeminiPro',
			apiBase: '',
			apiKey: '',
		},
		'open-router': {
			name: 'Open Router',
			apiKey: '',
		},
	}
};

export const supportedModels: Record<ProviderType, string[]> = {
	'codestory': ['Gpt4', 'GPT3_5_16k', 'CodeLlama7BInstruct', 'ClaudeHaiku', 'ClaudeSonnet', 'DeepSeekCoder33BInstruct', 'Gpt4Turbo'],
	'openai-default': ['Gpt4Turbo', 'Gpt4_32k', 'Gpt4', 'GPT3_5_16k', 'GPT3_5', 'Gpt4O', 'o1-preview', 'o1-mini'],
	'azure-openai': ['Gpt4Turbo', 'Gpt4_32k', 'Gpt4', 'GPT3_5_16k', 'GPT3_5'],
	'togetherai': ['Mixtral', 'MistralInstruct', 'CodeLlama13BInstruct', 'CodeLlama7BInstruct', 'DeepSeekCoder33BInstruct'],
	'openai-compatible': ['Mixtral', 'MistralInstruct', 'CodeLlama13BInstruct', 'CodeLlama7BInstruct', 'DeepSeekCoder1.3BInstruct', 'DeepSeekCoder6BInstruct', 'DeepSeekCoder33BInstruct', 'DeepSeekCoderV2'],
	'ollama': ['Mixtral', 'MistralInstruct', 'CodeLlama13BInstruct', 'DeepSeekCoder1.3BInstruct', 'DeepSeekCoder6BInstruct', 'DeepSeekCoder33BInstruct', 'DeepSeekCoderV2'],
	'anthropic': ['ClaudeOpus', 'ClaudeSonnet', 'ClaudeHaiku'],
	'fireworkai': ['CodeLlama13BInstruct'],
	'geminipro': ['GeminiPro1.5'],
	'open-router': ['Gpt4', 'Gpt4O', 'GPT3_5_16k', 'CodeLlama7BInstruct', 'ClaudeHaiku', 'ClaudeSonnet', 'ClaudeOpus', 'DeepSeekCoder33BInstruct', 'Gpt4Turbo', 'Mixtral', 'MistralInstruct', 'CodeLlama13BInstruct', 'DeepSeekCoder1.3BInstruct', 'DeepSeekCoder6BInstruct', 'ClaudeOpus', 'GeminiPro1.5', 'DeepSeekCoderV2'],
};

export const providersSupportingModel = (model: string): ProviderType[] => {
	return Object.keys(supportedModels)
		.filter(provider => supportedModels[provider as ProviderType].includes(model)) as ProviderType[];
};

export const areLanguageModelItemsEqual = (a: ILanguageModelItem, b: ILanguageModelItem) => {
	return a.name === b.name
		&& a.contextLength === b.contextLength
		&& a.temperature === b.temperature
		&& a.provider.type === b.provider.type
		&& (a.provider.type === 'azure-openai'
			? (a.provider as AzureOpenAIModelProviderConfig).deploymentID === (b.provider as AzureOpenAIModelProviderConfig).deploymentID
			: true
		);
};


export const isDefaultProviderConfig = (key: ProviderType, config: ProviderConfig) => {
	const defaultConfig = defaultModelSelectionSettings.providers[key as keyof IModelProviders] as ProviderConfig;
	return defaultConfig
		&& defaultConfig.name === config.name
		&& (defaultConfig.name === 'OpenAI' || defaultConfig.name === 'Together AI' || defaultConfig.name === 'Azure OpenAI' || defaultConfig.name === 'OpenAI Compatible' || defaultConfig.name === 'Anthropic' || defaultConfig.name === 'Firework AI' || defaultConfig.name === 'GeminiPro' || defaultConfig.name === 'Open Router'
			? (defaultConfig).apiKey === (config as ProviderConfigsWithAPIKey).apiKey
			: true
		)
		&& (defaultConfig.name === 'Azure OpenAI' || defaultConfig.name === 'OpenAI Compatible' || defaultConfig.name === 'GeminiPro'
			? defaultConfig.apiBase === (config as BaseOpenAICompatibleProviderConfig).apiBase
			: true
		);
};

export const areProviderConfigsEqual = (a: ProviderConfig, b: ProviderConfig) => {
	return a.name === b.name
		&& (a.name === 'OpenAI' || a.name === 'Together AI' || a.name === 'Azure OpenAI' || a.name === 'OpenAI Compatible' || a.name === 'Anthropic' || a.name === 'Firework AI' || a.name === 'GeminiPro' || a.name === 'Open Router'
			? (a as ProviderConfigsWithAPIKey).apiKey === (b as ProviderConfigsWithAPIKey).apiKey
			: true
		)
		&& (a.name === 'Azure OpenAI' || a.name === 'OpenAI Compatible' || a.name === 'GeminiPro'
			? (a as BaseOpenAICompatibleProviderConfig).apiBase === (b as BaseOpenAICompatibleProviderConfig).apiBase
			: true
		);
};
