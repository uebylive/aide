/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from 'vs/base/common/json';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IAIModelSelectionService, IModelSelectionSettings, LanguageModelItem, ModelProviderItem, ModelSelectionSettings } from 'vs/platform/aiModel/common/aiModels';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

/// JSON schema for the model selection settings file
// {
// 	"slowModel": "GPT-2",
// 	"fastModel": "GPT-3"
//  "models": [
//    {
//    	"title": "GPT-2",
//    	"name": "gpt2",
//    	"contextLength": 256,
//    	"temperature": 0.7
//    },
//    {
//    	"title": "GPT-3",
//    	"name": "gpt3",
//    	"contextLength": 256,
//    	"temperature": 0.7
//    }
//  ],
//  "providers": [
//    {
//    	"name": "OpenAI",
//    	"baseURL": "https://api.openai.com/v1",
//    	"apiKey": "your-api-key"
//    },
//    {
//    	"name": "EleutherAI",
//    	"baseURL": "https://models.eleuther.ai",
//    	"apiKey": ""
//    }
//  ]
// }

const defaultModelSelectionSettings: IModelSelectionSettings = {
	slowModel: 'GPT-4',
	fastModel: 'GPT-3',
	models: [
		{
			title: 'GPT-3',
			name: 'gpt3',
			contextLength: 16385,
			temperature: 0.2
		},
		{
			title: 'GPT-4',
			name: 'gpt4',
			contextLength: 8192,
			temperature: 0.2
		}
	],
	providers: [
		{
			name: 'OpenAI',
			baseURL: 'https://api.openai.com/v1',
			apiKey: 'your-api-key'
		},
	]
};

function parseModelSelectionSettings(value: any): ModelSelectionSettings {
	const providersObj = 'providers' in value && Array.isArray(value.providers) ? value.providers : defaultModelSelectionSettings.providers;
	const providers: ModelProviderItem[] = providersObj.map((provider: any) => {
		const name = 'name' in provider && typeof provider.name === 'string' ? provider.name : '';
		const baseURL = 'baseURL' in provider && typeof provider.baseURL === 'string' ? provider.baseURL : '';
		const apiKey = 'apiKey' in provider && typeof provider.apiKey === 'string' ? provider.apiKey : '';
		return new ModelProviderItem(name, baseURL, apiKey);
	});

	const modelsObj = 'models' in value && Array.isArray(value.models) ? value.models : defaultModelSelectionSettings.models;
	const models: LanguageModelItem[] = modelsObj.map((model: any) => {
		const title = 'title' in model && typeof model.title === 'string' ? model.title : '';
		const name = 'name' in model && typeof model.name === 'string' ? model.name : '';
		const contextLength = 'contextLength' in model && typeof model.contextLength === 'number' ? model.contextLength : 0;
		const temperature = 'temperature' in model && typeof model.temperature === 'number' ? model.temperature : 0;
		return new LanguageModelItem(title, name, contextLength, temperature);
	});

	const slowModel = 'slowModel' in value && typeof value.slowModel === 'string' ? value.slowModel : defaultModelSelectionSettings.providers;
	const fastModel = 'fastModel' in value && typeof value.fastModel === 'string' ? value.fastModel : defaultModelSelectionSettings.fastModel;

	return new ModelSelectionSettings(slowModel, fastModel, models, providers);
}

export class AIModelsService extends Disposable implements IAIModelSelectionService {
	_serviceBrand: undefined;

	private modelSelectionSettings: ModelSelectionSettings = new ModelSelectionSettings(
		defaultModelSelectionSettings.slowModel,
		defaultModelSelectionSettings.fastModel,
		defaultModelSelectionSettings.models.map((model) => new LanguageModelItem(model.title, model.name, model.contextLength, model.temperature)),
		defaultModelSelectionSettings.providers.map((provider) => new ModelProviderItem(provider.name, provider.baseURL, provider.apiKey))
	);

	constructor(
		@IFileService private readonly fileService: IFileService
	) {
		super();
		this.init();
	}

	getModelSelectionSettings(): ModelSelectionSettings {
		return this.modelSelectionSettings;
	}

	private async init(): Promise<void> {
		const modelSelectionSettings = await this.readModelSelectionSettings();
		this.modelSelectionSettings = parseModelSelectionSettings(modelSelectionSettings);
	}

	private async readModelSelectionSettings(): Promise<Object> {
		try {
			const content = await this.fileService.readFile(URI.file('$HOME/aiModels.json'));
			const value = parse(content.value.toString());
			return Array.isArray(value) ? {} : value;
		} catch (e) {
			return {};
		}
	}
}

registerSingleton(IAIModelSelectionService, AIModelsService, InstantiationType.Eager);
