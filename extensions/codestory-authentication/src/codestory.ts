/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { authentication, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, Disposable, env, Event, EventEmitter, ExtensionContext, ProgressLocation, Uri, UriHandler, window } from 'vscode';
import * as crypto from 'crypto';

const AUTH_SERVER_URL = 'http://localhost:3333';
const AUTH_TYPE = 'codestory';
const AUTH_NAME = 'CodeStory';
const CLIENT_ID = 'client_01J0FW6XN8N2XJAECF7NE0Y65J';
const SESSIONS_SECRET_KEY = `${AUTH_TYPE}.sessions`;

class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
	public handleUri(uri: Uri) {
		this.fire(uri);
	}
}

function generateRandomString(length: number): string {
	const possibleCharacters =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	let randomString = '';
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * possibleCharacters.length);
		randomString += possibleCharacters[randomIndex];
	}
	return randomString;
}

async function generateCodeChallenge(verifier: string) {
	// Create a SHA-256 hash of the verifier
	const hash = crypto.createHash('sha256').update(verifier).digest();

	// Convert the hash to a base64 URL-encoded string
	const base64String = hash
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	return base64String;
}

interface CodeStoryAuthenticationSession extends AuthenticationSession {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
}

export class CodeStoryAuthProvider implements AuthenticationProvider, Disposable {
	private readonly _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._sessionChangeEmitter.event;

	get redirectUri() {
		const publisher = this.context.extension.packageJSON.publisher;
		const name = this.context.extension.packageJSON.name;
		return `${env.uriScheme}://${publisher}.${name}`;
	}

	private readonly _disposable: Disposable;
	private _pendingStates: string[] = [];
	private _codeExchangePromises = new Map<
		string,
		{ promise: Promise<string>; cancel: EventEmitter<void> }
	>();
	private _uriHandler = new UriEventHandler();
	private _sessions: CodeStoryAuthenticationSession[] = [];

	private static EXPIRATION_TIME_MS = 1000 * 60 * 5; // 5 minutes

	constructor(
		private readonly context: ExtensionContext
	) {
		this._disposable = Disposable.from(
			authentication.registerAuthenticationProvider(AUTH_TYPE, AUTH_NAME, this, { supportsMultipleAccounts: false })
		);
	}

	async initialize() {
		const sessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
		this._sessions = sessions ? JSON.parse(sessions) : [];
		await this._refreshSessions();
	}

	private async _refreshSessions(): Promise<void> {
		if (!this._sessions.length) {
			return;
		}

		for (const session of this._sessions) {
			try {
				const newSession = await this._refreshSession(session.refreshToken);
				session.accessToken = newSession.accessToken;
				session.refreshToken = newSession.refreshToken;
				session.expiresIn = newSession.expiresIn;
			} catch (e: any) {
				if (e.message === 'Network failure') {
					setTimeout(() => this._refreshSessions(), 60 * 1000);
					return;
				}
			}
		}

		await this.context.secrets.store(
			SESSIONS_SECRET_KEY,
			JSON.stringify(this._sessions),
		);

		this._sessionChangeEmitter.fire({
			added: [],
			removed: [],
			changed: this._sessions,
		});

		if (this._sessions[0].expiresIn) {
			setTimeout(
				() => this._refreshSessions(),
				(this._sessions[0].expiresIn * 1000 * 2) / 3,
			);
		}
	}

	private async _refreshSession(
		refreshToken: string,
	): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
		const response = await fetch(new URL('/auth/refresh', AUTH_SERVER_URL), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				refreshToken,
			}),
		});
		if (!response.ok) {
			throw new Error('Network failure');
		}
		const data = (await response.json()) as any;
		return {
			accessToken: data.accessToken,
			refreshToken: data.refreshToken,
			expiresIn: CodeStoryAuthProvider.EXPIRATION_TIME_MS,
		};
	}

	async getSessions(): Promise<readonly CodeStoryAuthenticationSession[]> {
		const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

		if (allSessions) {
			return JSON.parse(allSessions) as CodeStoryAuthenticationSession[];
		}

		return [];
	}

	async createSession(scopes: readonly string[]): Promise<CodeStoryAuthenticationSession> {
		try {
			const codeVerifier = generateRandomString(64);
			const codeChallenge = await generateCodeChallenge(codeVerifier);
			const token = await this.login(codeChallenge, scopes);
			if (!token) {
				throw new Error(`CodeStory login failure`);
			}

			const userInfo = (await this.getUserInfo(token, codeVerifier)) as any;
			const { user, access_token, refresh_token } = userInfo;

			const session: CodeStoryAuthenticationSession = {
				id: uuidv4(),
				accessToken: access_token,
				refreshToken: refresh_token,
				expiresIn: CodeStoryAuthProvider.EXPIRATION_TIME_MS,
				account: {
					label: user.first_name + ' ' + user.last_name,
					id: user.email,
				},
				scopes: [],
			};

			await this.context.secrets.store(
				SESSIONS_SECRET_KEY,
				JSON.stringify([session]),
			);

			this._sessionChangeEmitter.fire({
				added: [session],
				removed: [],
				changed: [],
			});

			return session;
		} catch (e) {
			window.showErrorMessage(`Sign in failed: ${e}`);
			throw e;
		}
	}

	async removeSession(sessionId: string): Promise<void> {
		const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
		if (allSessions) {
			const sessions = JSON.parse(allSessions) as CodeStoryAuthenticationSession[];
			const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
			const session = sessions[sessionIdx];
			sessions.splice(sessionIdx, 1);

			await this.context.secrets.store(
				SESSIONS_SECRET_KEY,
				JSON.stringify(sessions),
			);

			if (session) {
				this._sessionChangeEmitter.fire({
					added: [],
					removed: [session],
					changed: [],
				});
			}
		}
	}

	dispose() {
		this._disposable.dispose();
	}

	/**
	 * Log in to CodeStory via AuthKit
	 **/
	private async login(codeChallenge: string, scopes: readonly string[] = []) {
		return await window.withProgress<string>(
			{
				location: ProgressLocation.Notification,
				title: 'Signing in to CodeStory...',
				cancellable: true,
			},
			async (_, token) => {
				const stateId = uuidv4();

				this._pendingStates.push(stateId);

				const scopeString = scopes.join(' ');

				const url = new URL('https://api.workos.com/user_management/authorize');
				const params = {
					response_type: 'code',
					client_id: CLIENT_ID,
					redirect_uri: this.redirectUri,
					state: stateId,
					code_challenge: codeChallenge,
					code_challenge_method: 'S256',
					provider: 'authkit',
				};

				Object.keys(params).forEach((key) =>
					url.searchParams.append(key, params[key as keyof typeof params]),
				);

				const oauthUrl = url;
				if (oauthUrl) {
					await env.openExternal(Uri.parse(oauthUrl.toString()));
				} else {
					return;
				}

				let codeExchangePromise = this._codeExchangePromises.get(scopeString);
				if (!codeExchangePromise) {
					codeExchangePromise = promiseFromEvent(
						this._uriHandler.event,
						this.handleUri(scopes),
					);
					this._codeExchangePromises.set(scopeString, codeExchangePromise);
				}

				try {
					return await Promise.race([
						codeExchangePromise.promise,
						new Promise<string>((_, reject) =>
							setTimeout(() => reject('Cancelled'), 60000),
						),
						promiseFromEvent<any, any>(
							token.onCancellationRequested,
							(_, __, reject) => {
								reject('User Cancelled');
							},
						).promise,
					]);
				} finally {
					this._pendingStates = this._pendingStates.filter(
						(n) => n !== stateId,
					);
					codeExchangePromise?.cancel.fire();
					this._codeExchangePromises.delete(scopeString);
				}
			},
		);
	}

	/**
	 * Handle the redirect to Aide (after sign in from CodeStory)
	 * @param scopes
	 * @returns
	 **/
	private handleUri: (
		scopes: readonly string[]
	) => PromiseAdapter<Uri, string> = () => async (uri, resolve, reject) => {
		const query = new URLSearchParams(uri.query);
		const access_token = query.get('code');
		const state = query.get('state');

		if (!access_token) {
			reject(new Error('No token'));
			return;
		}
		if (!state) {
			reject(new Error('No state'));
			return;
		}

		// Check if it is a valid auth request started by the extension
		if (!this._pendingStates.some((n) => n === state)) {
			reject(new Error('State not found'));
			return;
		}

		resolve(access_token);
	};

	/**
	 * Get the user info from WorkOS
	 * @param token
	 * @returns
	 **/
	private async getUserInfo(token: string, codeVerifier: string) {
		const resp = await fetch(
			'https://api.workos.com/user_management/authenticate',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					client_id: CLIENT_ID,
					code_verifier: codeVerifier,
					grant_type: 'authorization_code',
					code: token,
				}),
			},
		);
		const text = await resp.text();
		const data = JSON.parse(text);
		return data;
	}
}

interface PromiseAdapter<T, U> {
	(
		value: T,
		resolve: (value: U | PromiseLike<U>) => void,
		reject: (reason: any) => void,
	): any;
}

const passthrough = (value: any, resolve: (value?: any) => void) =>
	resolve(value);

/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
function promiseFromEvent<T, U>(
	event: Event<T>,
	adapter: PromiseAdapter<T, U> = passthrough,
): { promise: Promise<U>; cancel: EventEmitter<void> } {
	let subscription: Disposable;
	const cancel = new EventEmitter<void>();

	return {
		promise: new Promise<U>((resolve, reject) => {
			cancel.event((_) => reject('Cancelled'));
			subscription = event((value: T) => {
				try {
					Promise.resolve(adapter(value, resolve, reject)).catch(reject);
				} catch (error) {
					reject(error);
				}
			});
		}).then(
			(result: U) => {
				subscription.dispose();
				return result;
			},
			(error) => {
				subscription.dispose();
				throw error;
			},
		),
		cancel,
	};
}
