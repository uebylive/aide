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
import { IDimension } from 'vs/base/browser/dom';
import { ISerializableView } from 'vs/base/browser/ui/grid/grid';

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
		const aideControlsPart = this.instantiationService.createInstance(AideControlsPart);
		this._register(aideControlsPart);
		const aideControlsPartContainer = document.createElement('div');
		aideControlsPartContainer.classList.add('part', 'aidecontrols');
		container.insertBefore(aideControlsPartContainer, editorContainer.nextSibling);
		aideControlsPart.create(aideControlsPartContainer);
		return aideControlsPart;
	}
}

export type AideControlsPosition = {
	bottom: number;
	left: number;
};

export interface IOverlayedView extends ISerializableView {
	element: HTMLElement;
	setAvailableSize(width: number, height: number): void;
	getAvailableSize(): IDimension;
	setPosition(bottom: number, left: number): void;
	getPosition(): AideControlsPosition;
}

export class AideControlsPart extends Part implements IDisposable {

	static readonly activePanelSettingsKey = 'workbench.aidecontrols.activepanelid';

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 100;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	private _availableSize: IDimension = { width: 0, height: 0 };
	getAvailableSize(): IDimension {
		return this._availableSize;
	}
	setAvailableSize(width: number, height: number): void {
		this._availableSize = { width, height };
	}
	private _position: AideControlsPosition = { bottom: 0, left: 0 };
	getPosition(): AideControlsPosition {
		return this._position;
	}
	setPosition(bottom: number, left: number): void {
		this._position = { bottom, left };
	}

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
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
		return this.element;
	}

	override layout(width: number, height: number): void {
		// @willis - Should call super.layout() ?
		this.element.style.height = `${Math.min(this._availableSize.height, height)}px`;
		this.element.style.width = `${Math.min(this._availableSize.width, width)}px`;
	}

	toJSON(): object {
		return {
			type: Parts.AIDECONTROLS_PART
		};
	}
}
