/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/aidecontrols';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { MultiWindowParts, Part } from 'vs/workbench/browser/part';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IAideControlsService } from 'vs/workbench/services/aideControls/browser/aideControlsService';
import { $ } from 'vs/base/browser/dom';
import { AideControls } from 'vs/workbench/contrib/aideProbe/browser/aideControls';


export class AideControlsService extends MultiWindowParts<AideControlsPart> implements IAideControlsService {

	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.createMainControlsPart());

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService
	) {
		super('workbench.aideControlsService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));
	}

	createMainControlsPart(): AideControlsPart {
		return this.instantiationService.createInstance(AideControlsPart);
	}

	createAuxiliaryControlsPart(): AideControlsPart {
		return this.instantiationService.createInstance(AideControlsPart);
	}
}

export class AideControlsPart extends Part implements IDisposable {

	static readonly activePanelSettingsKey = 'workbench.aidecontrols.activepanelid';

	private height = 200;

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 100;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(
			Parts.AIDECONTROLS_PART,
			{ hasTitle: true },
			themeService,
			storageService,
			layoutService
		);
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		// Container
		this.element = parent;
		this.instantiationService.createInstance(AideControls, this.element);
		return this.element;
	}

	override layout(availableWidth: number, availableHeight: number, bottom: number, left: number): void {
		const height = Math.min(availableHeight, this.height);
		const top = bottom - height;
		super.layout(availableWidth, height, top, left);
		this.element.style.height = `${height}px`;
		this.element.style.width = `${availableWidth}px`;
		this.element.style.left = `${left}px`;
		this.element.style.top = `${top}px`;

	}

	toJSON(): object {
		return {
			type: Parts.AIDECONTROLS_PART
		};
	}
}
