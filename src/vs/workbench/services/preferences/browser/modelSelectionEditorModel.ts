/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureOpenAIProviderConfig, IAIModelSelectionService, ILanguageModelItem, IModelProviders, ProviderConfig, ProviderConfigsWithAPIKey, ProviderType } from 'vs/platform/aiModel/common/aiModels';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IModelItem, IModelItemEntry, IProviderItem, IProviderItemEntry } from 'vs/workbench/services/preferences/common/preferences';

export class ModelSelectionEditorModel extends EditorModel {

	private _fastModel!: IModelItem;
	private _slowModel!: IModelItem;
	private _modelItems!: IModelItem[];
	private _providerItems!: IProviderItem[];

	constructor(
		@IAIModelSelectionService private readonly aiModelSelectionService: IAIModelSelectionService
	) {
		super();

		this._register(this.aiModelSelectionService.onDidChangeModelSelection(() => {
			this.resolve();
		}));
	}

	get fastModel(): IModelItemEntry {
		return { modelItem: this._fastModel };
	}

	get slowModel(): IModelItemEntry {
		return { modelItem: this._slowModel };
	}

	get modelItems(): IModelItemEntry[] {
		return this._modelItems.map(model => ({ modelItem: model }));
	}

	get providerItems(): IProviderItemEntry[] {
		return this._providerItems.map(provider => ({ providerItem: provider }));
	}

	static getLanguageModelItem(modelItem: IModelItemEntry): ILanguageModelItem {
		return {
			name: modelItem.modelItem.name,
			contextLength: modelItem.modelItem.contextLength,
			temperature: modelItem.modelItem.temperature,
			provider: modelItem.modelItem.providerConfig
		};
	}

	static getProviderConfig(providerItem: IProviderItemEntry): ProviderConfig {
		return {
			name: providerItem.providerItem.name,
			...(providerItem.providerItem.type !== 'ollama' ? { apiKey: (providerItem.providerItem as ProviderConfigsWithAPIKey).apiKey } : {}),
			...(providerItem.providerItem.type === 'azure-openai' ? { apiBase: (providerItem.providerItem as AzureOpenAIProviderConfig).apiBase } : {})
		} as ProviderConfig;
	}

	override async resolve(): Promise<void> {
		const modelSelectionSettings = await this.aiModelSelectionService.getModelSelectionSettings();
		this._modelItems = Object.keys(modelSelectionSettings.models).map(modelKey => {
			const model = modelSelectionSettings.models[modelKey];
			const provider = modelSelectionSettings.providers[model.provider.type as keyof IModelProviders] as ProviderConfig;
			return {
				key: modelKey,
				name: model.name,
				contextLength: model.contextLength,
				temperature: model.temperature,
				provider: {
					type: model.provider.type,
					...provider
				},
				providerConfig: model.provider
			} as IModelItem;
		});
		this._providerItems = Object.keys(modelSelectionSettings.providers).map(providerKey => {
			const provider = modelSelectionSettings.providers[providerKey as keyof IModelProviders] as ProviderConfig;
			return {
				type: providerKey as ProviderType,
				...provider
			} as IProviderItem;
		});
		const fastModel = modelSelectionSettings.models[modelSelectionSettings.fastModel];
		const fastModelProvider = modelSelectionSettings.providers[fastModel.provider as keyof IModelProviders] as ProviderConfig;
		this._fastModel = {
			key: modelSelectionSettings.fastModel,
			name: fastModel.name,
			contextLength: fastModel.contextLength,
			temperature: fastModel.temperature,
			provider: {
				type: fastModel.provider.type,
				...fastModelProvider
			},
			providerConfig: fastModel.provider
		};
		const slowModel = modelSelectionSettings.models[modelSelectionSettings.slowModel];
		const slowModelProvider = modelSelectionSettings.providers[slowModel.provider as keyof IModelProviders] as ProviderConfig;
		this._slowModel = {
			key: modelSelectionSettings.slowModel,
			name: slowModel.name,
			contextLength: slowModel.contextLength,
			temperature: slowModel.temperature,
			provider: {
				type: slowModel.provider.type,
				...slowModelProvider
			},
			providerConfig: slowModel.provider
		};

		return super.resolve();
	}
}
