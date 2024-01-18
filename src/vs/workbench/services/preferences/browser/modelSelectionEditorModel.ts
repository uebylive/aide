/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAIModelSelectionService, IModelProviders, ProviderConfig, ProviderType } from 'vs/platform/aiModel/common/aiModels';
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

	override async resolve(): Promise<void> {
		const modelSelectionSettings = this.aiModelSelectionService.getModelSelectionSettings();
		this._modelItems = Object.keys(modelSelectionSettings.models).map(modelKey => {
			const model = modelSelectionSettings.models[modelKey];
			const provider = modelSelectionSettings.providers[model.provider as keyof IModelProviders] as ProviderConfig;
			return {
				key: modelKey,
				name: model.name,
				provider: {
					key: model.provider,
					name: provider.name
				},
				contextLength: model.contextLength,
				temperature: model.temperature
			} as IModelItem;
		});
		this._providerItems = Object.keys(modelSelectionSettings.providers).map(providerKey => {
			const provider = modelSelectionSettings.providers[providerKey as keyof IModelProviders] as ProviderConfig;
			return {
				key: providerKey as ProviderType,
				name: provider.name
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
				key: fastModel.provider,
				name: fastModelProvider.name
			}
		};
		const slowModel = modelSelectionSettings.models[modelSelectionSettings.slowModel];
		const slowModelProvider = modelSelectionSettings.providers[slowModel.provider as keyof IModelProviders] as ProviderConfig;
		this._slowModel = {
			key: modelSelectionSettings.slowModel,
			name: slowModel.name,
			contextLength: slowModel.contextLength,
			temperature: slowModel.temperature,
			provider: {
				key: slowModel.provider,
				name: slowModelProvider.name
			}
		};

		return super.resolve();
	}
}
