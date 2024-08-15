/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideControlsPart } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';

export const IAideControlsPartService = createDecorator<IAideControlsPartService>('aideControlsService');

export interface IAideControlsPartService {

	readonly _serviceBrand: undefined;
	readonly mainPart: AideControlsPart;
	getPart(container: HTMLElement): IDisposable;
	createMainControlsPart(): AideControlsPart;
	createAuxiliaryControlsPart(container: HTMLElement, editorsContainer: HTMLElement): AideControlsPart;
}
