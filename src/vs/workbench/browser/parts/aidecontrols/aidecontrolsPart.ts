/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/aidecontrols';
import { IWorkbenchLayoutService, OverlayedParts } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { MultiWindowParts } from 'vs/workbench/browser/part';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IAideControlsService } from 'vs/workbench/services/aideControls/browser/aideControlsService';
import { IOverlayedPartPosition, OverlayedPart } from 'vs/workbench/browser/overlayedPart';

export class AideControlsService extends MultiWindowParts<AideControlsPart> implements IAideControlsService {

	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.createMainControlsPart());

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super('workbench.aideControlsService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));
	}

	createMainControlsPart(): AideControlsPart {
		return this.instantiationService.createInstance(AideControlsPart);
	}

	createAuxiliaryControlsPart(container: HTMLElement, editorContainer: HTMLElement): AideControlsPart {
		const aideControlsPartContainer = document.createElement('div');
		const aideControlsPart = this.instantiationService.createInstance(AideControlsPart);
		this._register(aideControlsPart);
		aideControlsPartContainer.classList.add('part', 'aidecontrols');
		container.insertBefore(aideControlsPartContainer, editorContainer.nextSibling);
		return aideControlsPart;
	}
}

export type AideControlsPosition = {
	bottom: number;
	left: number;
};


export class AideControlsPart extends OverlayedPart implements IDisposable {

	static readonly activePanelSettingsKey = 'workbench.aidecontrols.activepanelid';


	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	readonly minimumHeight: number = 200;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
	) {
		super(
			OverlayedParts.AIDECONTROLS_PART,
			themeService,
			storageService,
			layoutService
		);
	}

	override layout(width: number, height: number): void {
		super.layout(width, height);
		this.applyPosition('top', this.position.top);
		this.applyPosition('bottom', this.position.bottom);
		this.applyPosition('left', this.position.left);
		this.applyPosition('right', this.position.right);
		this.element.style.height = `${this.height}px`;
		this.element.style.width = `${this.width}px`;
	}

	private applyPosition(key: keyof IOverlayedPartPosition, value: number | undefined) {
		if (value !== undefined) {
			this.element.style[key] = `${value}px`;
		} else {
			this.element.style[key] = '';
		}
	}
}
