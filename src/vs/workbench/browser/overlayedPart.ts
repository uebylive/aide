/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from '../../base/browser/dom.js';
import { Emitter } from '../../base/common/event.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { IColorTheme, IThemeService } from '../../platform/theme/common/themeService.js';
import { Component } from '../common/component.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import './media/part.css';

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
	layout(width?: number, height?: number): void;
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
		this._register(layoutService.registerOverlayedPart(this));
	}

	create(parent: HTMLElement): void {
		this.element = parent;
		this.parent = parent;
		this.element.style.position = 'absolute';
		this.element.style.overflow = 'visible';
		this.element.style.zIndex = '10';
		this._height = this.preferredHeight;
		this._width = this.preferredWidth;
		this.updateStyles();
	}

	protected override onThemeChange(theme: IColorTheme): void {
		// only call if our create() method has been called
		if (this.parent) {
			super.onThemeChange(theme);
		}
	}

	abstract preferredWidth: number;
	abstract preferredHeight: number;

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
		this.element.style.bottom = `${position.bottom}px`;
		this.element.style.left = `${position.left}px`;
	}

	protected _onDidSizeChange = this._register(new Emitter<IDimension>());
	readonly onDidSizeChange = this._onDidSizeChange.event;

	layout(width?: number, height?: number): void {

		if (width) {
			this.preferredWidth = width;
		}
		const newWidth = Math.max(this.minimumWidth, Math.min(this._availableWidth, this.preferredWidth || this._width));
		if (height) {
			this.preferredHeight = height;
		}
		const newHeight = Math.max(this.minimumHeight, Math.min(this._availableHeight, this.preferredHeight || this._height));

		if (newWidth === this._width || newHeight === this._height) {
			this._onDidSizeChange.fire({ width: newWidth, height: newHeight });
		}
		this._width = newWidth;
		this._height = newHeight;




		this.element.style.width = `${this._width}px`;
		this.element.style.height = `${this._height}px`;
	}

	setVisible(visible: boolean) {
		this._onDidVisibilityChange.fire(visible);
	}
}
