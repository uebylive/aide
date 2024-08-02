/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideEditsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideEditsPanel';

export class AideControls extends Disposable {

	//private panel: AideControlsPanel | undefined;

	constructor(container: HTMLElement, @IInstantiationService instantiationService: IInstantiationService) {
		super();

		this._register(instantiationService.createInstance(AideEditsPanel, container));

	}
}
