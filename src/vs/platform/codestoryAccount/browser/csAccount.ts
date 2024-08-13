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
import { CSAuthenticationSessionAccount, ICSAccountService, ICSAuthenticationService } from 'vs/platform/codestoryAccount/common/csAccount';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';

const $ = dom.$;

export class CSAccountService extends Disposable implements ICSAccountService {
	_serviceBrand: undefined;

	private authenticatedAccount: CSAuthenticationSessionAccount | undefined;

	private isVisible: boolean = false;
	private csAccountCard: HTMLElement | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICSAuthenticationService private readonly csAuthenticationService: ICSAuthenticationService
	) {
		super();

		this.csAuthenticationService.getSession().then(session => {
			if (session) {
				this.authenticatedAccount = session.account;
			} else {
				this.authenticatedAccount = undefined;
			}
		});
	}

	toggle(): void {
		if (!this.isVisible) {
			this.show();
			this.isVisible = true;
		} else {
			this.hide();
			this.isVisible = false;
		}
	}

	private show(): void {
		const container = this.layoutService.activeContainer;
		const csAccountCard = this.csAccountCard = dom.append(container, $('.cs-account-card'));

		if (this.authenticatedAccount) {
			// User is signed in
			const profileRow = dom.append(this.csAccountCard, $('.profile-row'));
			const profilePicture = dom.append(profileRow, $('.profile-picture'));
			profilePicture.classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
			const userDetails = dom.append(profileRow, $('.user-details'));
			const name = dom.append(userDetails, $('.name'));
			const email = dom.append(userDetails, $('.email'));
			name.textContent = this.authenticatedAccount.label;
			email.textContent = this.authenticatedAccount.label;

			const logoutButton = this._register(this.instantiationService.createInstance(Button, csAccountCard, defaultButtonStyles));
			logoutButton.label = 'Log Out';
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
					this.authenticatedAccount = session.account;

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
