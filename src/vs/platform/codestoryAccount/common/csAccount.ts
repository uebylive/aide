/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface ICSAccountController {
	/**
	 * Show the CodeStory account card.
	 **/
	show(): void;

	/**
	 * Hide the CodeStory account card.
	 **/
	hide(): void;
}

export const ICSAccountService = createDecorator<ICSAccountService>('csAccountService');

export interface ICSAccountService {
	readonly _serviceBrand: undefined;
	readonly csAccountController: ICSAccountController;
}
