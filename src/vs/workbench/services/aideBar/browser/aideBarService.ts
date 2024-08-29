/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideBarPart } from 'vs/workbench/browser/parts/aidebar/aidebarPart';

export const IAideBarService = createDecorator<IAideBarService>('aideBarService');

export interface IAideBarService {
	readonly _serviceBrand: undefined;
	readonly mainPart: AideBarPart;
	getPart(container: HTMLElement): IDisposable;
	createAuxiliaryControlsPart(container: HTMLElement, editorsContainer: HTMLElement): AideBarPart;
}
