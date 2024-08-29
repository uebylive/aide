/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import 'vs/css!./media/aidePanel';
import { Orientation, OrthogonalEdge, Sash } from 'vs/base/browser/ui/sash/sash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IDimension } from 'vs/editor/common/core/dimension';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Heroicon } from 'vs/workbench/browser/heroicon';

export enum PanelStates {
	Idle = 'idle',
	Loading = 'loading',
}


export abstract class AidePanel extends Disposable {

	get width() {
		return this.body.width;
	}
	get height() {
		return this.body.height + this.header.height;
	}

	get minWidth() {
		return this._width;
	}
	set minWidth(width: number) {
		this._minWidth = width;
		this.layout(this._width, this._height);
	}

	get minHeight() {
		return this._height;
	}
	set minHeight(height: number) {
		this._minHeight = height;
		this.layout(this._width, this._height);
	}

	get maxWidth() {
		return this._maxWidth;
	}
	set maxWidth(width: number) {
		this._maxWidth = width;
		this.layout(this._width, this._height);
	}

	get maxHeight() {
		return this._maxHeight;
	}
	set maxHeight(height: number) {
		this._maxHeight = height;
		this.layout(this._width, this._height);
	}

	get isVisible() {
		return this._isVisible;
	}

	get state(): PanelStates {
		return this._state;
	}

	private readonly element: HTMLElement;
	private bottomSash: Sash;
	private leftSash: Sash;


	private _width: number = 200;
	private _minWidth = 200;
	private _maxWidth = Infinity;
	private _height: number = 400;
	private _minHeight = 200;
	private _maxHeight = Infinity;
	private _isVisible: boolean = false;
	private _state: PanelStates = PanelStates.Idle;

	private readonly _onDidChangeState = this._register(new Emitter<PanelStates>());
	readonly onDidChangeState = this._onDidChangeState.event;


	readonly header: PanelHeader;
	readonly body: PanelBody;


	private _onDidResize = this._register(new Emitter<IDimension>());
	readonly onDidResize: Event<IDimension> = this._onDidResize.event;


	constructor(private readonly reference: HTMLElement, instantiationService: IInstantiationService, initialSize?: IDimension, headerText?: string, iconId?: string) {
		super();
		this.element = $('.aide-panel');
		// TODO(@g-danna): Replace this with popover
		this.reference.appendChild(this.element);

		this.header = this._register(instantiationService.createInstance(PanelHeader, instantiationService, headerText, iconId));
		this.body = this._register(instantiationService.createInstance(PanelBody));

		if (!this._isVisible) {
			this.hide();
		}

		this.element.appendChild(this.header.element);
		this.element.appendChild(this.body.element);

		if (initialSize) {
			this._height = initialSize.height;
			this._width = initialSize.width;
		}

		// @ts-ignore
		// TODO(@g-danna): Why is this not working as expected?
		this.leftSash = instantiationService.createInstance(Sash, this.element, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL });
		this.bottomSash = instantiationService.createInstance(Sash, this.element, { getHorizontalSashTop: () => this.element.offsetHeight }, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.South });
		this.bottomSash.orthogonalStartSash = this.leftSash;

		if (this._isVisible) {
			this.layout(this._height, this._width);
		}

		this._register(this.bottomSash.onDidStart((dragStart) => {
			const initialHeight = this.height;
			const initialY = dragStart.currentY;
			const onDragEvent = this._register(this.bottomSash.onDidChange((dragChange) => {
				const delta = dragChange.currentY - initialY;
				const newHeight = initialHeight + delta;
				this.layout(newHeight, this._width);
				this._onDidResize.fire({ height: newHeight, width: this._width });
			}));

			const onDragEndEvent = this._register(this.bottomSash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));

		this._register(this.leftSash.onDidStart((dragStart) => {
			const initialWidth = this.width;
			const initialX = dragStart.currentX;
			const onDragEvent = this._register(this.leftSash.onDidChange((dragChange) => {
				const delta = dragChange.currentX - initialX;
				const newWidth = initialWidth - delta;
				this.layout(this.height, newWidth);
				this._onDidResize.fire({ height: this.height, width: newWidth });
			}));

			const onDragEndEvent = this._register(this.leftSash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));

	}

	hide() {
		this.element.style.display = 'none';
		this._isVisible = false;
	}

	show() {
		this.element.style.display = 'block';
		this.layout(this._height, this._width);
		this._isVisible = true;
	}

	layout(height: number, width: number) {
		// TODO(@g-danna): Fix resizing issue
		const newWidth = Math.max(this._minWidth, Math.min(width, this._maxWidth));
		const newHeight = Math.max(this._minHeight, Math.min(height, this._maxHeight));
		this.body.layout(newHeight - this.header.height, newWidth);
		this._height = this.body.height + this.header.height;
		this._width = newWidth;
		this.bottomSash.layout();
	}

	setHeaderIcon(iconId: string) {
		this.header.setIcon(iconId);
	}

	setHeaderText(text: string) {
		this.header.setHeaderText(text);
	}

	setState(state: PanelStates) {
		this._state = state;
		this._onDidChangeState.fire(state);
		this.header.showSpinner(state === PanelStates.Loading);
	}

	public override dispose(): void {
		super.dispose();
	}
}


class PanelHeader extends Disposable {

	readonly element: HTMLElement;
	private readonly textElement: HTMLElement;
	private icon: Heroicon;

	private _height: number = 32;
	get height() {
		return this._height;
	}

	constructor(instantiationService: IInstantiationService, initialText?: string, iconId?: string) {
		super();
		this.element = $('.aide-panel-header');

		this.icon = this._register(instantiationService.createInstance(Heroicon, this.element, iconId ?? 'micro/bolt'));

		this.textElement = $('.aide-panel-header-text');
		this.element.appendChild(this.textElement);
		if (initialText) {
			this.setHeaderText(initialText);
		}

		this.element.style.height = `${this._height}px`;
	}


	showSpinner(show: boolean) {
		// TODO: Add SVG sprite icon
		if (show) {
			this.element.classList.add('loading');
		} else {
			this.element.classList.remove('loading');
		}
	}

	setIcon(iconId: string) {
		if (this.icon) {
			this.icon.dispose();
		}
		this.icon = new Heroicon(this.element, iconId);
	}

	setHeaderText(text: string) {
		this.textElement.textContent = text;
	}
}


class PanelBody extends Disposable {

	readonly element: HTMLElement;
	private _height: number = 0;
	get height() {
		return this._height;
	}

	private _width: number = 0;
	get width() {
		return this._width;
	}

	constructor() {
		super();
		this.element = $('.aide-panel-body');
	}

	layout(height: number, width: number) {
		this._height = height;
		this._width = width;
		this.element.style.height = `${height}px`;
		this.element.style.width = `${width}px`;
	}
}
