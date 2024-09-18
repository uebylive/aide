/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AideBarPart } from '../../../browser/parts/aidebar/aidebarPart.js';

export const IAideBarService = createDecorator<IAideBarService>('aideBarService');

export interface IAideBarService {
	readonly _serviceBrand: undefined;
	readonly mainPart: AideBarPart;
	getPart(container: HTMLElement): IDisposable;
	createAuxiliaryControlsPart(container: HTMLElement, editorsContainer: HTMLElement): AideBarPart;
}
