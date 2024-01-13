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
		this._modelItems = modelSelectionSettings.models.map(model => ({
			name: model.name,
			provider: model.provider,
			contextLength: model.contextLength,
			temperature: model.temperature
		}));
		this._providerItems = modelSelectionSettings.providers.map(provider => ({
			name: provider.name,
			apiKey: provider.apiKey,
			baseURL: provider.baseURL
		}));
		this._fastModel = this._modelItems.find(model => model.name === modelSelectionSettings.fastModel) ?? defaultFastModel;
		this._slowModel = this._modelItems.find(model => model.name === modelSelectionSettings.slowModel) ?? defaultSlowModel;

		return super.resolve();
	}
}
