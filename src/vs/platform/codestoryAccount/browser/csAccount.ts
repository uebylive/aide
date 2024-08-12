/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/csAccount';
import { ICSAccountController } from 'vs/platform/codestoryAccount/common/csAccount';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';

const $ = dom.$;

export class CSAccountController extends Disposable implements ICSAccountController {
	private csAccountCard: HTMLElement | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super();
	}

	show(): void {
		const container = this.layoutService.activeContainer;
		this.csAccountCard = dom.append(container, $('.cs-account-card'));
		const name = dom.append(this.csAccountCard, $('.name'));
		name.textContent = 'John Doe';
	}

	hide(): void {
		if (this.csAccountCard) {
			this.csAccountCard.remove();
		}
	}
}
