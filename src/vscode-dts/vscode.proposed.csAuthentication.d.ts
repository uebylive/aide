/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface CSAccount {
		/**
		 * The unique identifier of the account.
		 */
		readonly id: string;

		/**
		 * The human-readable name of the account.
		 */
		readonly label: string;
	}

	export interface CSAuthenticationSession {
		/**
		 * The access token.
		 */
		readonly accessToken: string;

		/**
		 * The account associated with the session.
		 */
		readonly account: CSAccount;
	}

	export namespace csAuthentication {
		export function getSession(): Thenable<CSAuthenticationSession | undefined>;
	}
}
