/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/aidebar';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { MultiWindowParts, Part } from 'vs/workbench/browser/part';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IAideBarService } from 'vs/workbench/services/aideBar/browser/aideBarService';
import { $, append } from 'vs/base/browser/dom';

export class AideBarService extends MultiWindowParts<AideBarPart> implements IAideBarService {

	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.instantiationService.createInstance(AideBarPart));

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super('workbench.aideBarService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));
	}

	createAuxiliaryControlsPart(container: HTMLElement, editorContainer: HTMLElement): AideBarPart {
		const aideBarPartContainer = document.createElement('div');
		const aideBarPart = this.instantiationService.createInstance(AideBarPart);
		this._register(aideBarPart);
		aideBarPartContainer.classList.add('part', 'aidebar');
		container.insertBefore(aideBarPartContainer, editorContainer.nextSibling);
		return aideBarPart;
	}
}

export type AideBarPosition = {
	bottom: number;
	left: number;
};


export class AideBarPart extends Part implements IDisposable {

	static readonly activePanelSettingsKey = 'workbench.aidebar.activepanelid';


	private content: HTMLElement | undefined;


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
			Parts.AIDEBAR_PART,
			{ hasTitle: false },
			themeService,
			storageService,
			layoutService
		);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.content = append(this.element, $('.content'));
		return this.content;
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.AIDEBAR_PART
		};
	}
}
