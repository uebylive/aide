/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { MultiWindowParts, Part } from 'vs/workbench/browser/part';
import { IBottomBarPartService } from 'vs/workbench/services/bottomBarPart/browser/bottomBarPartService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

const $ = dom.$;

export class BottomBarPartService extends MultiWindowParts<BottomBarPart> implements IBottomBarPartService {
	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.instantiationService.createInstance(BottomBarPart));

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super('workbench.bottomBarPartService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));
	}

	createAuxiliaryControlsPart(container: HTMLElement, editorContainer: HTMLElement): BottomBarPart {
		const bottomBarPartContainer = document.createElement('div');
		const bottomBarPart = this.instantiationService.createInstance(BottomBarPart);
		this._register(bottomBarPart);
		bottomBarPartContainer.classList.add('part', 'bottombar-part');
		container.insertBefore(bottomBarPartContainer, editorContainer.nextSibling);
		return bottomBarPart;
	}
}

export type BottomBarPosition = {
	bottom: number;
	left: number;
};

export class BottomBarPart extends Part implements IDisposable {
	static readonly activePanelSettingsKey = 'workbench.bottombar.activepanelid';

	private _content!: HTMLElement;
	get content(): HTMLElement {
		return this._content;
	}

	readonly preferredHeight = 38;
	readonly preferredWidth = Number.POSITIVE_INFINITY;
	readonly minimumWidth: number = 200;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 38;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
	) {
		super(
			Parts.BOTTOMBAR_PART,
			{ hasTitle: false },
			themeService,
			storageService,
			layoutService
		);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.getColor(editorBackground);
		this.element.style.backgroundColor = this.getColor(editorBackground)?.toString() || 'transparent';
		this._content = dom.append(this.element, $('.content'));
		return this._content;
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.BOTTOMBAR_PART,
		};
	}
}
