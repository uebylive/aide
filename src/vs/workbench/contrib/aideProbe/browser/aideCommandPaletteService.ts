/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideCommandPaletteWidget } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteWidget';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export interface IAideCommandPaletteData {
	id: string;
}

export interface IAideCommandPaletteService {
	_serviceBrand: undefined;
	widget: AideCommandPaletteWidget | undefined;

	showPalette(): void;
	acceptInput(): void;
	cancelRequest(): void;
	hidePalette(): void;
}

export const IAideCommandPaletteService = createDecorator<IAideCommandPaletteService>('IAideCommandPaletteService');

export class AideCommandPaletteService extends Disposable implements IAideCommandPaletteService {
	_serviceBrand: undefined;

	static readonly ID = 'workbench.contrib.commandPalette';

	private _container: HTMLElement | undefined;
	private _mounted = false;

	private _widget: AideCommandPaletteWidget | undefined;
	get widget(): AideCommandPaletteWidget | undefined {
		return this._widget;
	}

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();

		// QUESTION Does it make sense to mount the palette here?
		if (!this._mounted) {
			this.mountPalette();
		}

		this._register(this.workbenchLayoutService.onDidChangeActiveContainer(async () => {
			// note: we intentionally don't keep the activeContainer before the
			// `await` clause to avoid any races due to quickly switching windows.
			await this.workbenchLayoutService.whenContainerStylesLoaded(dom.getWindow(this.workbenchLayoutService.activeContainer));
			if (this._mounted) {
				this.unmountPalette();
			}
			this.mountPalette();
		}));
	}

	showPalette(): void {
		if (!this._mounted) {
			this.mountPalette();
		}
		if (!this._widget) {
			return;
		}
		this._widget.show();
	}

	async acceptInput() {
		if (!this._widget) {
			return;
		}
		this._widget.acceptInput();
	}

	cancelRequest(): void {
		if (!this._widget) {
			return;
		}
		this._widget.cancelRequest();
	}

	hidePalette(): void {
		if (!this._mounted || !this._widget) {
			return;
		}
		this._widget.hide();
	}

	private mountPalette(): void {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('command-palette-container');
			this.workbenchLayoutService.activeContainer.appendChild(this._container);
		}

		if (!this._mounted) {
			this._widget = this.instantiationService.createInstance(AideCommandPaletteWidget, this._container);
		}

		this._mounted = true;
	}

	private unmountPalette(): void {
		this._widget?.dispose();
		this._widget = undefined;
		this._mounted = false;
	}
}
