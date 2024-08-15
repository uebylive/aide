/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/part';
import { Component } from 'vs/workbench/common/component';
import { IThemeService, IColorTheme } from 'vs/platform/theme/common/themeService';
import { IDimension } from 'vs/base/browser/dom';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Emitter } from 'vs/base/common/event';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export interface IPartOptions {
	readonly hasTitle?: boolean;
	readonly borderWidth?: () => number;
}

export interface ILayoutContentResult {
	readonly headerSize: IDimension;
	readonly titleSize: IDimension;
	readonly contentSize: IDimension;
	readonly footerSize: IDimension;
}


export interface IOverlayedView {
	element: HTMLElement;
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly availableHeight: number;
	readonly availableWidth: number;
	setAvailableSize(size: IDimension): void;
	readonly position: IOverlayedPartPosition;
	setPosition(position: IOverlayedPartPosition): void;
}

export interface IOverlayedPartPosition {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}

export abstract class OverlayedPart extends Component implements IOverlayedView {

	protected _onDidVisibilityChange = this._register(new Emitter<boolean>());
	readonly onDidVisibilityChange = this._onDidVisibilityChange.event;

	private parent: HTMLElement | undefined;
	element!: HTMLElement;

	constructor(
		id: string,
		themeService: IThemeService,
		storageService: IStorageService,
		protected readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, themeService, storageService);
		//this._register(layoutService.registerOverlayedPart(this));
	}

	create(parent: HTMLElement): void {
		this.element = parent;
		this.parent = parent;
		this.updateStyles();
	}

	protected override onThemeChange(theme: IColorTheme): void {
		// only call if our create() method has been called
		if (this.parent) {
			super.onThemeChange(theme);
		}
	}

	abstract minimumWidth: number;
	abstract maximumWidth: number;

	abstract minimumHeight: number;
	abstract maximumHeight: number;

	private _availableWidth: number = 0;
	private _availableHeight: number = 0;
	get availableWidth() { return this._availableWidth; }
	get availableHeight() { return this._availableHeight; }

	private _width: number = 0;
	private _height: number = 0;
	get width() { return this._width; }
	get height() { return this._height; }

	setAvailableSize(size: IDimension): void {
		this._availableWidth = size.width;
		this._availableHeight = size.height;
	}

	private _position: IOverlayedPartPosition = {};
	get position() { return this._position; }

	setPosition(position: IOverlayedPartPosition): void {
		this._position = position;
	}

	protected _onDidSizeChange = this._register(new Emitter<IDimension>());
	readonly onDidSizeChange = this._onDidSizeChange.event;

	layout(width: number, height: number): void {

		const newWidth = Math.max(this.minimumWidth, Math.min(this._availableWidth, width));
		const newHeight = Math.max(this.minimumHeight, Math.min(this._availableHeight, height));

		if (this._width !== newWidth || this._height !== newHeight) {
			this._onDidSizeChange.fire({ width: newWidth, height: newHeight });
		}
		this._width = newWidth;
		this._height = newHeight;
	}

	setVisible(visible: boolean) {
		this._onDidVisibilityChange.fire(visible);
	}
}
