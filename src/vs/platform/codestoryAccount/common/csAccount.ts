/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface CSAuthenticationSessionAccount {
	label: string;
	id: string;
}

export interface CSAuthenticationSession {
	id: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	account: CSAuthenticationSessionAccount;
}

export type CSUser = {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	created_at: string;
	updated_at: string;
	email_verified: boolean;
	profile_picture_url: string;
};

export type EncodedCSTokenData = {
	access_token: string;
	refresh_token: string;
};

export type CSUserProfileResponse = {
	user: CSUser;
};

export const ICSAccountService = createDecorator<ICSAccountService>('csAccountService');
export interface ICSAccountService {
	readonly _serviceBrand: undefined;

	toggle(): void;
}

export const ICSAuthenticationService = createDecorator<ICSAuthenticationService>('csAuthenticationService');
export interface ICSAuthenticationService {
	readonly _serviceBrand: undefined;

	createSession(): Promise<CSAuthenticationSession>;
	refreshTokens(): Promise<void>;
	getSession(): Promise<CSAuthenticationSession | undefined>;
}
