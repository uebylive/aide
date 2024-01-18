/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// base
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { parse } from 'vs/base/common/json';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { dirname } from 'vs/base/common/resources';

// platform
import { IAIModelSelectionService, IModelSelectionSettings, defaultModelSelectionSettings, isModelSelectionSettings } from 'vs/platform/aiModel/common/aiModels';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

// workbench
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class AIModelsService extends Disposable implements IAIModelSelectionService {
	_serviceBrand: undefined;

	private modelSelection: ModelSelection;

	private readonly _onDidChangeModelSelection: Emitter<IModelSelectionSettings> = this._register(new Emitter<IModelSelectionSettings>());
	public readonly onDidChangeModelSelection: Event<IModelSelectionSettings> = this._onDidChangeModelSelection.event;

	constructor(
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super();

		new ModelSelectionJsonSchema();
		this.modelSelection = this._register(new ModelSelection(userDataProfileService, uriIdentityService, fileService, logService));
		this.modelSelection.onDidChange(() => {
			this._onDidChangeModelSelection.fire(this.modelSelection.modelSelection);
		});
		this.modelSelection.initialize();
	}

	public getDefaultModelSelectionContent(): string {
		return JSON.stringify(defaultModelSelectionSettings, null, '\t');
	}

	getModelSelectionSettings(): IModelSelectionSettings {
		return this.modelSelection.modelSelection;
	}
}

class ModelSelection extends Disposable {
	private _rawModelSelection: Object = {};
	private _modelSelection: IModelSelectionSettings = defaultModelSelectionSettings;
	get modelSelection(): IModelSelectionSettings { return this._modelSelection; }

	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	private readonly watchDisposables = this._register(new DisposableStore());

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly userDataProfileService: IUserDataProfileService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly fileService: IFileService,
		logService: ILogService,
	) {
		super();

		this.watch();

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
			if (changed) {
				this._onDidChange.fire();
			}
		}), 50));

		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.userDataProfileService.currentProfile.modelSelectionResource))(() => {
			logService.debug('Model selection file changed');
			this.reloadConfigurationScheduler.schedule();
		}));

		this._register(this.fileService.onDidRunOperation((e) => {
			if (e.operation === FileOperation.WRITE && e.resource.toString() === this.userDataProfileService.currentProfile.modelSelectionResource.toString()) {
				logService.debug('Model selection file written');
				this.reloadConfigurationScheduler.schedule();
			}
		}));

		this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
			if (!this.uriIdentityService.extUri.isEqual(e.previous.modelSelectionResource, e.profile.modelSelectionResource)) {
				e.join(this.whenCurrentProfileChanged());
			}
		}));
	}

	private async whenCurrentProfileChanged(): Promise<void> {
		this.watch();
		this.reloadConfigurationScheduler.schedule();
	}

	private watch(): void {
		this.watchDisposables.clear();
		this.watchDisposables.add(this.fileService.watch(dirname(this.userDataProfileService.currentProfile.modelSelectionResource)));
		// Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
		this.watchDisposables.add(this.fileService.watch(this.userDataProfileService.currentProfile.modelSelectionResource));
	}

	async initialize(): Promise<void> {
		await this.reload();
	}

	private async reload(): Promise<boolean> {
		const newModelSelection = await this.readModelSelectionSettings();
		if (objects.equals(this._rawModelSelection, newModelSelection)) {
			// no change
			return false;
		}

		this._rawModelSelection = newModelSelection;
		this._modelSelection = this.mergeModelSelectionSettings(newModelSelection);
		return true;
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
			'openaiProvider': {
				'type': 'object',
				'properties': {
					'openai-default': {
						'type': 'object',
						'properties': {
							'name': {
								'enum': ['OpenAI'],
								'description': nls.localize('modelSelection.json.openaiProvider.name', 'Name of the provider'),
								'$vocabulary': 'openaiProviderName'
							},
							'apiKey': {
								'type': 'string',
								'description': nls.localize('modelSelection.json.openaiProvider.apiKey', 'API key of the provider')
							}
						},
						'required': ['name']
					}
				}
			},
			'azureOpenAIProvider': {
				'type': 'object',
				'properties': {
					'azure-openai': {
						'type': 'object',
						'properties': {
							'name': {
								'enum': ['Azure OpenAI'],
								'description': nls.localize('modelSelection.json.azureOpenAIProvider.name', 'Name of the provider'),
								'$vocabulary': 'azureOpenAIProviderName'
							},
							'apiBase': {
								'type': 'string',
								'description': nls.localize('modelSelection.json.azureOpenAIProvider.apiBase', 'API base URL of the provider')
							},
							'apiKey': {
								'type': 'string',
								'description': nls.localize('modelSelection.json.azureOpenAIProvider.apiKey', 'API key of the provider')
							},
							'apiVersion': {
								'type': 'string',
								'description': nls.localize('modelSelection.json.azureOpenAIProvider.apiVersion', 'API version of the provider')
							}
						},
						'required': ['name', 'apiBase', 'apiKey', 'apiVersion']
					}
				},
			},
			'togetherAIProvider': {
				'type': 'object',
				'properties': {
					'togetherai': {
						'type': 'object',
						'properties': {
							'name': {
								'enum': ['Together AI'],
								'description': nls.localize('modelSelection.json.togetherAIProvider.name', 'Name of the provider')
							},
							'apiKey': {
								'type': 'string',
								'description': nls.localize('modelSelection.json.togetherAIProvider.apiKey', 'API key of the provider')
							}
						},
						'required': ['name', 'apiKey']
					}
				}
			},
			'ollamaProvider': {
				'type': 'object',
				'properties': {
					'ollama': {
						'type': 'object',
						'properties': {
							'name': {
								'enum': ['Ollama'],
								'description': nls.localize('modelSelection.json.ollamaProvider.name', 'Name of the provider')
							}
						},
						'required': ['name']
					}
				}
			},
			'providers': {
				'oneOf': [
					{ '$ref': '#/definitions/openaiProvider' },
					{ '$ref': '#/definitions/azureOpenAIProvider' },
					{ '$ref': '#/definitions/togetherAIProvider' },
					{ '$ref': '#/definitions/ollamaProvider' }
				]
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
						'enum': ['openai-default', 'azure-openai', 'togetherai', 'ollama'],
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
				'$ref': '#/definitions/providers',
				'description': nls.localize('modelSelection.json.providers', 'Providers available for selection'),
			}
		}
	};

	private readonly schemaRegistry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);

	constructor() {
		this.schemaRegistry.registerSchema(ModelSelectionJsonSchema.schemaId, this.schema);
	}
}

registerSingleton(IAIModelSelectionService, AIModelsService, InstantiationType.Eager);
