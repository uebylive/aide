/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import { parse } from 'vs/base/common/json';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable } from 'vs/base/common/lifecycle';
import { IAIModelSelectionService, IModelSelectionSettings, isModelSelectionSettings } from 'vs/platform/aiModel/common/aiModels';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

const defaultModelSelectionSettings: IModelSelectionSettings = {
	slowModel: 'gpt-4-32k',
	fastModel: 'gpt-3.5-turbo',
	models: {
		'inline-chat-edit-lora-v0.0': {
			name: 'CodeStory (Mistral 7B fine-tuned)',
			contextLength: 8192,
			temperature: 0.2,
			provider: 'Ollama'
		},
		'gpt-3.5-turbo': {
			name: 'GPT-3.5',
			contextLength: 4096,
			temperature: 0.2,
			provider: 'OpenAI'
		},
		'gpt-4-32k': {
			name: 'GPT-4 32k',
			contextLength: 32768,
			temperature: 0.2,
			provider: 'OpenAI'
		},
		'gpt-4-1106-preview': {
			name: 'GPT-4 Turbo',
			contextLength: 128000,
			temperature: 0.2,
			provider: 'OpenAI'
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

export class AIModelsService extends Disposable implements IAIModelSelectionService {
	_serviceBrand: undefined;

	private modelSelectionSettings: IModelSelectionSettings = defaultModelSelectionSettings;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		// Just initializing and not assigning, since the schema is never updated.
		// Registering allows the schema to be used in the model selection settings editor.
		new ModelSelectionJsonSchema();

		this.init();
	}

	public getDefaultModelSelectionContent(): string {
		return JSON.stringify(defaultModelSelectionSettings, null, '\t');
	}

	getModelSelectionSettings(): IModelSelectionSettings {
		return this.modelSelectionSettings;
	}

	private async init(): Promise<void> {
		const modelSelectionSettings = await this.readModelSelectionSettings();
		this.modelSelectionSettings = this.mergeModelSelectionSettings(modelSelectionSettings);
	}

	private async readModelSelectionSettings(): Promise<Object> {
		try {
			const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.modelSelectionResource);
			const value = parse(content.value.toString());
			return isModelSelectionSettings(value) ? value : {};
		} catch (e) {
			return {};
		}
	}

	private mergeModelSelectionSettings(modelSelectionSettings: Object): IModelSelectionSettings {
		const mergedSettings = { ...defaultModelSelectionSettings };
		if (modelSelectionSettings && isModelSelectionSettings(modelSelectionSettings)) {
			if (modelSelectionSettings.models) {
				mergedSettings.models = { ...defaultModelSelectionSettings.models, ...modelSelectionSettings.models };
			}
			if (modelSelectionSettings.providers) {
				mergedSettings.providers = { ...defaultModelSelectionSettings.providers, ...modelSelectionSettings.providers };
			}

			if (modelSelectionSettings.slowModel && mergedSettings.models[modelSelectionSettings.slowModel]) {
				mergedSettings.slowModel = modelSelectionSettings.slowModel;
			}
			if (modelSelectionSettings.fastModel && mergedSettings.models[modelSelectionSettings.fastModel]) {
				mergedSettings.fastModel = modelSelectionSettings.fastModel;
			}
		}
		return mergedSettings;
	}
}

class ModelSelectionJsonSchema {
	private static readonly schemaId = 'vscode://schemas/modelSelection';

	private readonly schema: IJSONSchema = {
		id: ModelSelectionJsonSchema.schemaId,
		type: 'object',
		title: nls.localize('modelSelection.json.title', "Model Selection Settings"),
		allowTrailingCommas: true,
		allowComments: true,
		definitions: {
			'provider': {
				'type': 'object',
				'properties': {
					'name': {
						'type': 'string',
						'description': nls.localize('modelSelection.json.provider.name', 'Name of the provider')
					},
					'apiKey': {
						'type': ['string', 'null'],
						'description': nls.localize('modelSelection.json.provider.apiKey', 'API key for the provider')
					}
				}
			},
			'model': {
				'type': 'object',
				'properties': {
					'name': {
						'type': 'string',
						'description': nls.localize('modelSelection.json.model.name', 'Name of the model')
					},
					'contextLength': {
						'type': 'number',
						'description': nls.localize('modelSelection.json.model.contextLength', 'Context length of the model')
					},
					'temperature': {
						'type': 'number',
						'description': nls.localize('modelSelection.json.model.temperature', 'Temperature of the model')
					},
					'provider': {
						'type': 'string',
						'description': nls.localize('modelSelection.json.model.provider', 'Provider of the model')
					}
				}
			}
		},
		properties: {
			'slowModel': {
				'type': 'string',
				'description': nls.localize('modelSelection.json.slowModel', 'The default model for slow mode')
			},
			'fastModel': {
				'type': 'string',
				'description': nls.localize('modelSelection.json.fastModel', 'The default model for fast mode')
			},
			'models': {
				'type': 'object',
				'description': nls.localize('modelSelection.json.models', 'Models available for selection'),
				'additionalProperties': {
					'$ref': '#/definitions/model'
				}
			},
			'providers': {
				'type': 'object',
				'description': nls.localize('modelSelection.json.providers', 'Providers available for selection'),
				'additionalProperties': {
					'$ref': '#/definitions/provider'
				}
			}
		}
	};

	private readonly schemaRegistry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);

	constructor() {
		this.schemaRegistry.registerSchema(ModelSelectionJsonSchema.schemaId, this.schema);
	}
}

registerSingleton(IAIModelSelectionService, AIModelsService, InstantiationType.Eager);
