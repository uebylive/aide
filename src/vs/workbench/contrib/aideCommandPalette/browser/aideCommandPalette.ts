/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideCommandPaletteWidget } from 'vs/workbench/contrib/aideCommandPalette/browser/aideCommandPaletteWidget';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideCommandPalette/common/aideCommandPaletteService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { Disposable } from 'vs/base/common/lifecycle';


export const VIEW_ID = 'workbench.view.aideCommandPalette';


export class AideCommandPaletteService extends Disposable implements IAideCommandPaletteService {
	private _container: HTMLElement | undefined;
	private _widget: AideCommandPaletteWidget | undefined;

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	open(): void {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('command-palette-container');
			this.workbenchLayoutService.activeContainer.appendChild(this._container);
			this._widget = this.instantiationService.createInstance(AideCommandPaletteWidget, this._container);
			this._widget.render();
			this._widget.focus();
			this._widget.onDidBlur(() => this.close());
		}
	}

	close = (): void => {
		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}
	};
}
