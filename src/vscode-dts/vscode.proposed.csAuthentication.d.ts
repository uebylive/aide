/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	interface AuthenticatedCSUser {
		email: string;
	}

	export interface CSAuthenticationSession {
		/**
		 * The access token.
		 */
		readonly accessToken: string;

		/**
		 * The authenticated user.
		 */
		readonly account: AuthenticatedCSUser;
	}

	export namespace csAuthentication {
		export function getSession(): Thenable<CSAuthenticationSession | undefined>;
	}
}
