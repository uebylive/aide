/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface CSAuthenticationSession {
	id: string;
	accessToken: string;
	refreshToken: string;
	account: CSUser;
	waitlistPosition: number;
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
	waitlistPosition: number;
};

export const ICSAccountService = createDecorator<ICSAccountService>('csAccountService');
export interface ICSAccountService {
	readonly _serviceBrand: undefined;

	toggle(): void;
	ensureAuthenticated(): Promise<boolean>;
}

export const ICSAuthenticationService = createDecorator<ICSAuthenticationService>('csAuthenticationService');
export interface ICSAuthenticationService {
	readonly _serviceBrand: undefined;
	readonly onDidAuthenticate: Event<CSAuthenticationSession>;

	createSession(): Promise<CSAuthenticationSession>;
	deleteSession(sessionId: string): Promise<void>;
	refreshTokens(): Promise<void>;
	getSession(): Promise<CSAuthenticationSession | undefined>;

	notifyWaitlistPosition(position?: number): void;
}
