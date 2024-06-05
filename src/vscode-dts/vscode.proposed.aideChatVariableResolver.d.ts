/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace aideChat {

		/**
		 * Register a variable which can be used in a chat request to any participant.
		 * @param id A unique ID for the variable.
		 * @param name The name of the variable, to be used in the chat input as `#name`.
		 * @param userDescription A description of the variable for the chat input suggest widget.
		 * @param modelDescription A description of the variable for the model.
		 * @param isSlow Temp, to limit access to '#codebase' which is not a 'reference' and will fit into a tools API later.
		 * @param resolver Will be called to provide the chat variable's value when it is used.
		 * @param fullName The full name of the variable when selecting context in the picker UI.
		 * @param icon An icon to display when selecting context in the picker UI.
		 */
		export function registerChatVariableResolver(id: string, name: string, userDescription: string, modelDescription: string | undefined, isSlow: boolean | undefined, resolver: ChatVariableResolver, fullName?: string, icon?: ThemeIcon): Disposable;
	}
}
