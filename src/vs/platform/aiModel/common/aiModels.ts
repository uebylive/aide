/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IAIModelSelectionService = createDecorator<IAIModelSelectionService>('aiModelSelectionService');
export interface IAIModelSelectionService {
	readonly _serviceBrand: undefined;

	getModelSelectionSettings(): ModelSelectionSettings;
}

export interface ILanguageModelItem {
	readonly title: string;
	readonly name: string;
	readonly contextLength: number;
	readonly temperature: number;
}

export interface IModelProviderItem {
	readonly name: string;
	readonly baseURL: string;
	readonly apiKey: string;
}

export interface IModelSelectionSettings {
	readonly slowModel: string;
	readonly fastModel: string;
	readonly models: ILanguageModelItem[];
	readonly providers: IModelProviderItem[];
}

export class ModelSelectionSettings {
	_modelSelectionSettingsBrand: void = undefined;

	public readonly slowModel: string;
	public readonly fastModel: string;
	public readonly models: LanguageModelItem[];
	public readonly providers: ModelProviderItem[];

	constructor(slowModel: string, fastModel: string, models: LanguageModelItem[], providers: ModelProviderItem[]) {
		this.slowModel = slowModel;
		this.fastModel = fastModel;
		this.models = models;
		this.providers = providers;
	}
}

export class LanguageModelItem {
	_languageModelItemBrand: void = undefined;

	public readonly title: string;
	public readonly name: string;
	public readonly contextLength: number;
	public readonly temperature: number;

	constructor(title: string, name: string, contextLength: number, temperature: number) {
		this.title = title;
		this.name = name;
		this.contextLength = contextLength;
		this.temperature = temperature;
	}
}

export class ModelProviderItem {
	_modelProviderBrand: void = undefined;

	public readonly name: string;
	public readonly baseURL: string;
	public readonly apiKey: string;

	constructor(name: string, baseURL: string, apiKey: string) {
		this.name = name;
		this.baseURL = baseURL;
		this.apiKey = apiKey;
	}
}
