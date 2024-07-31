/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AideControlsPart } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';

export const IAideControlsService = createDecorator<IAideControlsService>('aideControlsService');

export interface IAideControlsService {

	readonly _serviceBrand: undefined;
	getPart(container: HTMLElement): IDisposable;
	createMainControlsPart(): AideControlsPart;
	createAuxiliaryControlsPart(): AideControlsPart;
}