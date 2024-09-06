/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchLayoutService, OverlayedParts } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { MultiWindowParts } from 'vs/workbench/browser/part';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IAideControlsPartService } from 'vs/workbench/services/aideControlsPart/browser/aideControlsPartService';
import { OverlayedPart } from 'vs/workbench/browser/overlayedPart';

export class AideControlsPartService extends MultiWindowParts<AideControlsPart> implements IAideControlsPartService {

	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.instantiationService.createInstance(AideControlsPart));

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super('workbench.aideControlsPartService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));
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

	readonly preferredHeight = 92;
	readonly preferredWidth = Number.POSITIVE_INFINITY; // Take whole width

	readonly minimumWidth: number = 200;
	readonly maximumWidth: number = 800;

	readonly minimumHeight: number = 92;
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

	override layout(width?: number, height?: number): void {
		super.layout(width, height);
	}

	get snap() {
		return false;
	}

	toJSON(): object {
		return {
			type: OverlayedParts.AIDECONTROLS_PART,
		};
	}
}
