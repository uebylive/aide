/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/csAccount';
import { CSAuthenticationSession, ICSAccountService, ICSAuthenticationService } from 'vs/platform/codestoryAccount/common/csAccount';
import { CS_ACCOUNT_CARD_VISIBLE } from 'vs/platform/codestoryAccount/common/csAccountContextKeys';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';

const $ = dom.$;

export class CSAccountService extends Disposable implements ICSAccountService {
	_serviceBrand: undefined;

	private authenticatedSession: CSAuthenticationSession | undefined;

	private isVisible: IContextKey<boolean>;
	private csAccountCard: HTMLElement | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICSAuthenticationService private readonly csAuthenticationService: ICSAuthenticationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService
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

	async ensureAuthenticated(): Promise<boolean> {
		try {
			let csAuthSession = await this.csAuthenticationService.getSession();
			if (!csAuthSession) {
				// Notify the user that they need to authenticate
				this.notificationService.info('You need to log in to access this feature.');
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
			if ((csAuthSession?.waitlistPosition ?? 0) > 0) {
				this.csAuthenticationService.notifyWaitlistPosition(csAuthSession.waitlistPosition);
				return false; // User is on the waitlist
			}
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
