/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ILanguageModelItem {
	readonly name: string;
	readonly contextLength: number;
	readonly temperature: number;
	readonly provider: string;
}

export function isLanguageModelItem(obj: any): obj is ILanguageModelItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& 'contextLength' in obj && typeof obj['contextLength'] === 'number'
		&& 'temperature' in obj && typeof obj['temperature'] === 'number'
		&& 'provider' in obj && typeof obj['provider'] === 'string';
}

export interface IModelProviderItem {
	readonly name: string;
	readonly baseURL?: string;
	readonly apiKey?: string | null;
}

export function isModelProviderItem(obj: any): obj is IModelProviderItem {
	return obj && typeof obj === 'object'
		&& 'name' in obj && typeof obj['name'] === 'string'
		&& ('baseURL' in obj ? typeof obj['baseURL'] === 'string' : true)
		&& ('apiKey' in obj ? typeof obj['apiKey'] === 'string' || typeof obj['apiKey'] === 'undefined' : true);
}

export interface IModelSelectionSettings {
	readonly slowModel: string;
	readonly fastModel: string;
	readonly models: Record<string, ILanguageModelItem>;
	readonly providers: Record<string, IModelProviderItem>;
}

export function isModelSelectionSettings(obj: any): obj is IModelSelectionSettings {
	return obj && typeof obj === 'object'
		&& ('slowModel' in obj ? typeof obj['slowModel'] === 'string' : true)
		&& ('fastModel' in obj ? typeof obj['fastModel'] === 'string' : true)
		&& ('models' in obj ? isModelProviderItem(obj['models']) : true)
		&& ('providers' in obj ? isModelProviderItem(obj['providers']) : true);
}

export const IAIModelSelectionService = createDecorator<IAIModelSelectionService>('aiModelSelectionService');
export interface IAIModelSelectionService {
	readonly _serviceBrand: undefined;

	getDefaultModelSelectionContent(): string;
	getModelSelectionSettings(): IModelSelectionSettings;
}
