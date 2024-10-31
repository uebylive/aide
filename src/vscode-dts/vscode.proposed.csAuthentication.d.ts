/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface CSAuthenticationSession {
		/**
		 * The access token.
		 */
		readonly accessToken: string;
	}

	export namespace csAuthentication {
		export function getSession(): Thenable<CSAuthenticationSession | undefined>;
	}
}
