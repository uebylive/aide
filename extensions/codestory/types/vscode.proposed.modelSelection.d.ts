/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface ModelSelection {
		slowModel: string;
		fastModel: string;
		models: LanguageModels;
		providers: ModelProviders;
	}

	export interface LanguageModelConfiguration {
		name: string;
		contextLength: number;
		temperature: number;
		provider: string;
	}

	export interface ModelProviderConfiguration {
		name: string;
		apiKey?: string | null;
		// passing additional keys for the payload
		deploymentId?: string | null;
		apiBase?: string | null;
		apiVersion?: string | null;
	}

	export type LanguageModels = Record<string, LanguageModelConfiguration>;
	export type ModelProviders = Record<string, ModelProviderConfiguration>;

	export namespace modelSelection {
		export function getConfiguration(): Thenable<ModelSelection>;
		export const onDidChangeConfiguration: Event<ModelSelection>;
	}
}
