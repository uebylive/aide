/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AideChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IAideChatMessageTextPart {
	type: 'text';
	value: string;
}

export interface IAideChatMessageFunctionResultPart {
	type: 'function_result';
	name: string;
	value: any;
	isError?: boolean;
}

export type IAideChatMessagePart = IAideChatMessageTextPart | IAideChatMessageFunctionResultPart;

export interface IAideChatMessage {
	readonly name?: string | undefined;
	readonly role: AideChatMessageRole;
	readonly content: IAideChatMessagePart;
}
