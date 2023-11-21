/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// ChatML
	// export enum ChatMessageRole {
	// 	System = 0,
	// 	User = 1,
	// 	Assistant = 2,
	// 	Function = 3,
	// }
	export type ChatMessageRole = 'function' | 'system' | 'user' | 'assistant';

	// ChatML
	export class ChatMessage {
		role: ChatMessageRole;
		content: string | null;
		name?: string;

		constructor(role: ChatMessageRole, content: string);
	}

}
