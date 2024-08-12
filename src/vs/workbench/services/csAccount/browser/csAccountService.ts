/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CSAccountController } from 'vs/platform/codestoryAccount/browser/csAccount';
import { ICSAccountController, ICSAccountService } from 'vs/platform/codestoryAccount/common/csAccount';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';

export class CSAccountService extends Themable implements ICSAccountService {
	declare readonly _serviceBrand: undefined;

	private _controller: ICSAccountController | undefined;
	get csAccountController(): ICSAccountController {
		if (!this._controller) {
			this._controller = this._register(this.instantiationService.createInstance(CSAccountController));
		}

		return this._controller;
	}

	constructor(
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(themeService);
	}
}

registerSingleton(ICSAccountService, CSAccountService, InstantiationType.Delayed);
