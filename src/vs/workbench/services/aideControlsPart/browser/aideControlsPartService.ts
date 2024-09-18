/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AideControlsPart } from '../../../browser/parts/aidecontrols/aidecontrolsPart.js';

export const IAideControlsPartService = createDecorator<IAideControlsPartService>('aideControlsService');

export interface IAideControlsPartService {

	readonly _serviceBrand: undefined;
	readonly mainPart: AideControlsPart;
	getPart(container: HTMLElement): IDisposable;
	createAuxiliaryControlsPart(container: HTMLElement, editorsContainer: HTMLElement): AideControlsPart;
}
