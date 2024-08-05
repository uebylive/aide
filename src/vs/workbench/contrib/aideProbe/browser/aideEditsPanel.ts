/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AideControlsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideControlsPanel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';


export class AideEditsPanel extends AideControlsPanel {

	static readonly ID = 'workbench.contrib.aideEditsPanel';

	constructor(
		parent: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService) {
		super(parent, instantiationService);
	}
}
