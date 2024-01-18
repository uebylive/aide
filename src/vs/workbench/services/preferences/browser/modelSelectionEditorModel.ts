/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAIModelSelectionService } from 'vs/platform/aiModel/common/aiModels';
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
			return {
				key: modelKey,
				name: model.name,
				provider: model.provider,
				contextLength: model.contextLength,
				temperature: model.temperature
			} as IModelItem;
		});
		this._providerItems = Object.keys(modelSelectionSettings.providers).map(providerKey => {
			const provider = modelSelectionSettings.providers[providerKey];
			return {
				key: providerKey,
				name: provider.name,
				baseURL: provider.baseURL,
				apiKey: provider.apiKey
			} as IProviderItem;
		});
		const fastModel = modelSelectionSettings.models[modelSelectionSettings.fastModel];
		this._fastModel = {
			key: modelSelectionSettings.fastModel,
			name: fastModel.name,
			contextLength: fastModel.contextLength,
			temperature: fastModel.temperature,
			provider: fastModel.provider
		};
		const slowModel = modelSelectionSettings.models[modelSelectionSettings.slowModel];
		this._slowModel = {
			key: modelSelectionSettings.slowModel,
			name: slowModel.name,
			contextLength: slowModel.contextLength,
			temperature: slowModel.temperature,
			provider: slowModel.provider
		};

		return super.resolve();
	}
}
