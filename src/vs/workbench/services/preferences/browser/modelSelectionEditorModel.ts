/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAIModelSelectionService } from 'vs/platform/aiModel/common/aiModels';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IModelItem, IModelItemEntry, IProviderItem, IProviderItemEntry } from 'vs/workbench/services/preferences/common/preferences';

// TODO: Refactor this to the right place
const defaultFastModel: IModelItem = {
	name: 'GPT-3.5',
	contextLength: 16385,
	temperature: 0.2,
	provider: 'OpenAI'
};

const defaultSlowModel: IModelItem = {
	name: 'GPT-4',
	contextLength: 8192,
	temperature: 0.2,
	provider: 'OpenAI'
};

export class ModelSelectionEditorModel extends EditorModel {

	private _fastModel: IModelItem;
	private _slowModel: IModelItem;
	private _modelItems: IModelItem[];
	private _providerItems: IProviderItem[];

	constructor(
		@IAIModelSelectionService private readonly aiModelSelectionService: IAIModelSelectionService
	) {
		super();
		this._fastModel = defaultFastModel;
		this._slowModel = defaultSlowModel;
		this._modelItems = [];
		this._providerItems = [];
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
				name: model.name,
				provider: model.provider,
				contextLength: model.contextLength,
				temperature: model.temperature
			} as IModelItem;
		});
		this._providerItems = Object.keys(modelSelectionSettings.providers).map(providerKey => {
			const provider = modelSelectionSettings.providers[providerKey];
			return {
				name: provider.name,
				baseURL: provider.baseURL,
				apiKey: provider.apiKey
			} as IProviderItem;
		});
		this._fastModel = modelSelectionSettings.models[modelSelectionSettings.fastModel];
		this._slowModel = modelSelectionSettings.models[modelSelectionSettings.slowModel];

		return super.resolve();
	}
}
