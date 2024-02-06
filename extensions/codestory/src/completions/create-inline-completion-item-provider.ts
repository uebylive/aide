/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode'


import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import { SideCarClient } from '../sidecar/client'

interface InlineCompletionItemProviderArgs {
	triggerNotice: ((notice: { key: string }) => void) | null,
	sidecarClient: SideCarClient,
}

export async function createInlineCompletionItemProvider({
	triggerNotice,
	sidecarClient,
}: InlineCompletionItemProviderArgs): Promise<vscode.Disposable> {

	const disposables: vscode.Disposable[] = []

	const completionsProvider = new InlineCompletionItemProvider({
		sidecarClient,
		completeSuggestWidgetSelection: true,
		triggerNotice,
	});

	disposables.push(
		// vscode.commands.registerCommand('cody.autocomplete.manual-trigger', () =>
		// 	completionsProvider.manuallyTriggerCompletion()
		// ),
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: '**' },
			completionsProvider
		),
		completionsProvider
	);

	return {
		dispose: () => {
			for (const disposable of disposables) {
				disposable.dispose()
			}
		},
	};
}

// Languages which should be disabled, but they are not present in
// https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// But they exist in the `vscode.languages.getLanguages()` return value.
//
// To avoid confusing users with unknown language IDs, we disable them here programmatically.
const DISABLED_LANGUAGES = new Set(['scminput']);

export async function getInlineCompletionItemProviderFilters(
	autocompleteLanguages: Record<string, boolean>
): Promise<vscode.DocumentFilter[]> {
	const { '*': isEnabledForAll, ...perLanguageConfig } = autocompleteLanguages;
	const languageIds = await vscode.languages.getLanguages();

	return languageIds.flatMap(language => {
		const enabled =
			!DISABLED_LANGUAGES.has(language) && language in perLanguageConfig
				? perLanguageConfig[language]
				: isEnabledForAll;

		return enabled ? [{ language, scheme: 'file' }] : [];
	})
}
