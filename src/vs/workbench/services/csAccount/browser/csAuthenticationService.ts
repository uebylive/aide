/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from 'vs/base/common/buffer';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { CSAuthenticationSession, CSUserProfileResponse, EncodedCSTokenData, ICSAuthenticationService } from 'vs/platform/codestoryAccount/common/csAccount';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IURLService } from 'vs/platform/url/common/url';

const AUTH_TYPE = 'codestory';
const SESSIONS_SECRET_KEY = `${AUTH_TYPE}.sessions`;
const EXPIRATION_TIME_MS = 1000 * 60 * 5;

export class CSAuthenticationService extends Themable implements ICSAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private _subscriptionsAPIBase: string | null = null;
	private _websiteBase: string | null = null;

	private _pendingStates: string[] = [];
	private _sessions: CSAuthenticationSession[] = [];

	constructor(
		@IThemeService themeService: IThemeService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IURLService private readonly urlService: IURLService,
	) {
		super(themeService);

		const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		if (isDevelopment) {
			this._subscriptionsAPIBase = 'https://staging-api.codestory.ai';
			this._websiteBase = 'https://staging.aide.dev';
		} else {
			this._subscriptionsAPIBase = 'https://api.codestory.ai';
			this._websiteBase = 'https://aide.dev';
		}

		this.urlService.create({ path: '/authenticate-codestory' });
		this.initialize();
	}

	private async initialize(): Promise<void> {
		const sessions = await this.secretStorageService.get(SESSIONS_SECRET_KEY);
		this._sessions = sessions ? JSON.parse(sessions) : [];
		await this.refreshTokens();
	}

	async refreshTokens(): Promise<void> {
		if (!this._sessions.length) {
			return;
		}

		const refreshedSessions: CSAuthenticationSession[] = [];

		for (const session of this._sessions) {
			try {
				const newSession = await this._refreshSession(session.refreshToken);
				refreshedSessions.push({
					...session,
					accessToken: newSession.accessToken,
					refreshToken: newSession.refreshToken,
					expiresIn: newSession.expiresIn,
				});
			} catch (e: any) {
				if (e.message === 'Network failure') {
					return;
				}
			}
		}

		this._sessions = refreshedSessions;
		await this.secretStorageService.set(SESSIONS_SECRET_KEY, JSON.stringify(this._sessions));
	}

	private async _refreshSession(
		refreshToken: string,
	): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
		const response = await fetch(`${this._subscriptionsAPIBase}/v1/auth/refresh`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				'refresh_token': refreshToken,
			}),
		});
		if (!response.ok) {
			throw new Error('Network failure');
		}
		const data = (await response.json()) as EncodedCSTokenData;
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: EXPIRATION_TIME_MS,
		};
	}

	async createSession(): Promise<CSAuthenticationSession> {
		try {
			const encodedTokenData = await this.login();
			if (!encodedTokenData) {
				throw new Error(`CodeStory login failure`);
			}

			const userInfo = (await this.getUserInfo(encodedTokenData));
			const { user, access_token, refresh_token } = userInfo;

			const session: CSAuthenticationSession = {
				id: generateUuid(),
				accessToken: access_token,
				refreshToken: refresh_token,
				expiresIn: EXPIRATION_TIME_MS,
				account: {
					label: user.first_name + ' ' + user.last_name,
					id: user.email,
				},
			};

			await this.secretStorageService.set(
				SESSIONS_SECRET_KEY,
				JSON.stringify([session]),
			);

			return session;
		} catch (e) {
			throw e;
		}
	}

	private async login() {
		const cts = new CancellationTokenSource();
		return await this.progressService.withProgress<string>(
			{
				location: ProgressLocation.Notification,
				title: 'Signing in to CodeStory...',
				cancellable: true,
			},
			async () => {
				const stateId = generateUuid();
				this._pendingStates.push(stateId);

				const url = `${this._websiteBase}/authenticate?state=${stateId}`;
				await this.openerService.open(url);

				try {
					// Use the built-in VSCode API for handling cancellation
					const timeoutPromise = new Promise<string>((_, reject) =>
						setTimeout(() => reject('Cancelled'), 60000)
					);
					const cancellationPromise = new Promise<string>((_, reject) => {
						const cancellationListener = cts.token.onCancellationRequested(() => {
							cancellationListener.dispose();
							reject('User Cancelled');
						});
					});

					const loginPromise = new Promise<string>((resolve, reject) => {
						const disposable = this.urlService.registerHandler({
							handleURL: async (uri: URI): Promise<boolean> => {
								try {
									const tokenData = await this.handleUri(uri);
									resolve(tokenData);
									disposable.dispose();
									return true;
								} catch (e) {
									reject(e);
									return false;
								}
							},
						});
					});

					const result = await Promise.race([
						loginPromise,
						timeoutPromise,
						cancellationPromise
					]);

					return result;
				} finally {
					this._pendingStates = this._pendingStates.filter(n => n !== stateId);
				}
			},
			() => cts.cancel()
		);
	}

	private async handleUri(uri: URI): Promise<string> {
		const query = new URLSearchParams(uri.query);
		const encodedData = query.get('data');
		if (!encodedData) {
			return '';
		}

		return encodedData;
	}

	async getSession(): Promise<CSAuthenticationSession | undefined> {
		const sessions = await this.secretStorageService.get(SESSIONS_SECRET_KEY);
		const sessionData = sessions ? JSON.parse(sessions) : [];
		if (sessionData.length) {
			return sessionData[0];
		}
		return undefined;
	}

	/**
	 * Get the user info from WorkOS
	 * @param encodedTokenData
	 * @returns
	 **/
	private async getUserInfo(encodedTokenData: string) {
		// Reverse the base64 encoding
		const tokenData = decodeBase64(encodedTokenData);
		const tokens = JSON.parse(tokenData.toString()) as EncodedCSTokenData;

		const resp = await fetch(
			`${this._subscriptionsAPIBase}/v1/users/me`,
			{
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${tokens.access_token}`,
				},
			},
		);
		const text = await resp.text();
		const data = JSON.parse(text) as CSUserProfileResponse;
		return { ...data, ...tokens };
	}
}

registerSingleton(ICSAuthenticationService, CSAuthenticationService, InstantiationType.Delayed);
