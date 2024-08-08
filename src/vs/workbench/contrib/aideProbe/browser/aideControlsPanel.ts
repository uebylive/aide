/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { IHorizontalSashLayoutProvider, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export enum PanelStates {
	Idle = 'idle',
	Loading = 'loading',
}

export interface PanelSizeChange {
	delta: number;
	newHeight: number;
}

export abstract class AideControlsPanel extends Disposable implements IHorizontalSashLayoutProvider {
	private readonly element: HTMLElement;
	readonly sash: Sash;


	private _state: PanelStates = PanelStates.Idle;
	get state(): PanelStates {
		return this._state;
	}

	get height() {
		return this.body.height + this.header.height;
	}

	private readonly _onDidChangeState = this._register(new Emitter<PanelStates>());
	readonly onDidChangeState = this._onDidChangeState.event;


	readonly header: PanelHeader;
	readonly body: PanelBody;


	private _onDidResize = this._register(new Emitter<PanelSizeChange>());
	readonly onDidResize: Event<PanelSizeChange> = this._onDidResize.event;


	constructor(container: HTMLElement, instantiationService: IInstantiationService) {
		super();

		this.element = $('.aide-controls-panel');

		this.header = this._register(instantiationService.createInstance(PanelHeader));
		this.body = this._register(instantiationService.createInstance(PanelBody));
		this.element.appendChild(this.header.element);
		this.element.appendChild(this.body.element);

		// Create and position the sash
		this.sash = this._register(instantiationService.createInstance(Sash, this.element, this, { orientation: Orientation.HORIZONTAL }));


		container.appendChild(this.element);

		// Handle sash drag events
		this._register(this.sash.onDidStart((dragStart) => {
			const initialHeight = this.body.height;
			const initialY = dragStart.currentY;
			const onDragEvent = this._register(this.sash.onDidChange((dragChange) => {
				const delta = dragChange.currentY - initialY;
				this._onDidResize.fire({ delta, newHeight: initialHeight - delta });
			}));

			const onDragEndEvent = this._register(this.sash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));
	}

	layout(height: number, width: number) {
		this.body.layout(height, width);
		this.sash.layout();
	}

	setState(state: PanelStates) {
		this._state = state;
		this._onDidChangeState.fire(state);
		this.header.showSpinner(state === PanelStates.Loading);
	}

	getHorizontalSashLeft() {
		return this.element.offsetLeft;
	}

	getHorizontalSashTop() {
		return this.element.offsetTop;
	}

	getHorizontalSashWidth() {
		return this.element.offsetWidth;
	}

}


class PanelHeader extends Disposable {

	readonly element: HTMLElement;
	private _height: number = 36;
	get height() {
		return this._height;
	}

	constructor(initialText?: string) {
		super();
		this.element = $('.aide-controls-panel-header');
		if (initialText) {
			this.setHeaderText(initialText);
		}

		this.element.style.backgroundColor = 'blue';
	}


	showSpinner(show: boolean) {
		// TODO: Add SVG sprite icon
		if (show) {
			this.element.classList.add('loading');
		} else {
			this.element.classList.remove('loading');
		}
	}

	setHeaderText(text: string) {
		this.element.textContent = text;
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
		this.element = $('.aide-controls-panel-body');
		this.element.style.outline = '1px solid blue';
		this.element.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
	}

	layout(height: number, width: number) {
		this._height = height;
		this._width = width;
		this.element.style.height = `${height}px`;
		this.element.style.width = `${width}px`;
	}
}
