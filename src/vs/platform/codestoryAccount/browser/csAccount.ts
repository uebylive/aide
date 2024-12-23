/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { INotificationService } from '../../notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { defaultButtonStyles } from '../../theme/browser/defaultStyles.js';
import { CSAuthenticationSession, ICSAccountService, ICSAuthenticationService } from '../common/csAccount.js';
import { CS_ACCOUNT_CARD_VISIBLE } from '../common/csAccountContextKeys.js';
import './media/csAccount.css';

const $ = dom.$;
const STORAGE_KEY = 'csAccount.requestCount';

export class CSAccountService extends Disposable implements ICSAccountService {
	_serviceBrand: undefined;

	private authenticatedSession: CSAuthenticationSession | undefined;

	private isVisible: IContextKey<boolean>;
	private csAccountCard: HTMLElement | undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICSAuthenticationService private readonly csAuthenticationService: ICSAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.isVisible = CS_ACCOUNT_CARD_VISIBLE.bindTo(this.contextKeyService);
		this.refresh();
	}

	private async refresh(): Promise<void> {
		const session = await this.csAuthenticationService.getSession();
		if (session) {
			this.authenticatedSession = session;
		} else {
			this.authenticatedSession = undefined;
		}
	}

	toggle(): void {
		if (!this.isVisible.get()) {
			this.show();
			this.isVisible.set(true);
		} else {
			this.hide();
			this.isVisible.set(false);
		}
	}

	async ensureAuthorized(): Promise<boolean> {
		const count = this.storageService.getNumber(STORAGE_KEY, StorageScope.PROFILE, 0);
		try {
			let csAuthSession = await this.csAuthenticationService.getSession();
			if (!csAuthSession) {
				// Show the account card
				this.toggle();
				// Wait for the user to authenticate
				csAuthSession = await new Promise<CSAuthenticationSession>((resolve, reject) => {
					const disposable = this.csAuthenticationService.onDidAuthenticate(session => {
						if (session) {
							resolve(session);
						} else {
							reject(new Error('Authentication failed'));
						}
						disposable.dispose();
					});
				});
			}

			// Increment the usage count
			this.storageService.store(STORAGE_KEY, count + 1, StorageScope.PROFILE, StorageTarget.MACHINE);
			return true; // User is authenticated and not on the waitlist
		} catch (error) {
			// Handle any errors that occurred during the authentication
			console.error('Error during refresh:', error);
			this.notificationService.error('An error occurred during the authentication process. Please try again later.');
			return false; // Authentication failed
		}
	}

	private async show(): Promise<void> {
		const container = this.layoutService.activeContainer;
		const csAccountCard = this.csAccountCard = dom.append(container, $('.cs-account-card'));
		if (!this.authenticatedSession) {
			await this.refresh();
		}

		if (this.authenticatedSession) {
			// User is signed in
			const user = this.authenticatedSession.account;
			const profileRow = dom.append(this.csAccountCard, $('.profile-row'));
			if (user.profile_picture_url) {
				const profilePicture = dom.append(profileRow, $<HTMLImageElement>('img.profile-picture'));
				profilePicture.src = user.profile_picture_url;
			} else {
				const profilePicture = dom.append(profileRow, $('.profile-picture'));
				profilePicture.classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
			}

			const userDetails = dom.append(profileRow, $('.user-details'));
			const name = dom.append(userDetails, $('.name'));
			const email = dom.append(userDetails, $('.email'));
			name.textContent = user.first_name + ' ' + user.last_name;
			email.textContent = user.email;

			const logoutButton = this._register(this.instantiationService.createInstance(Button, csAccountCard, defaultButtonStyles));
			logoutButton.label = 'Log Out';
			this._register(logoutButton.onDidClick(() => {
				if (!this.authenticatedSession) {
					return;
				}

				this.csAuthenticationService.deleteSession(this.authenticatedSession.id).then(() => {
					this.authenticatedSession = undefined;

					this.hide();
					this.show();
				});
			}));
		} else {
			// User is not signed in
			const loginPrompt = dom.append(this.csAccountCard, $('.login-prompt'));
			loginPrompt.textContent = 'Log in to CodeStory Account';
			const loginDescription = dom.append(this.csAccountCard, $('.login-description'));
			loginDescription.textContent = 'To get access to AI features';

			const loginButton = this._register(this.instantiationService.createInstance(Button, csAccountCard, defaultButtonStyles));
			loginButton.label = 'Log In...';
			this._register(loginButton.onDidClick(() => {
				this.csAuthenticationService.createSession().then(session => {
					this.authenticatedSession = session;

					this.hide();
					this.show();
				});
			}));
		}
	}

	private hide(): void {
		if (this.csAccountCard) {
			this.csAccountCard.remove();
		}
	}
}
