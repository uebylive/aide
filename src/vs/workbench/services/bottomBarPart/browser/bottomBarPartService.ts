/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { BottomBarPart } from 'vs/workbench/browser/parts/bottombar/bottomBarPart';

export const IBottomBarPartService = createDecorator<IBottomBarPartService>('bottomBarPartService');

export interface IBottomBarPartService {

	readonly _serviceBrand: undefined;
	readonly mainPart: BottomBarPart;
	getPart(container: HTMLElement): IDisposable;
	createAuxiliaryControlsPart(container: HTMLElement, editorsContainer: HTMLElement): BottomBarPart;
}
