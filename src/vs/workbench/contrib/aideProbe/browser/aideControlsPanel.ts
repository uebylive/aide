/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { IHorizontalSashLayoutProvider, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export enum PanelStates {
	Idle = 'idle',
	Loading = 'loading',
}

const DEFAULT_PANEL_HEIGHT = 200;

export abstract class AideControlsPanel extends Disposable implements IHorizontalSashLayoutProvider {
	private readonly element: HTMLElement;
	private readonly _sash: Sash;

	private _state: PanelStates = PanelStates.Idle;
	get state(): PanelStates {
		return this._state;
	}

	private readonly _onDidChangeState = this._register(new Emitter<PanelStates>());
	readonly onDidChangeState = this._onDidChangeState.event;


	readonly header: PanelHeader;
	readonly body: PanelBody;


	constructor(container: HTMLElement, instantiationService: IInstantiationService) {
		super();

		this.element = $('.aide-controls-panel');

		this.header = this._register(instantiationService.createInstance(PanelHeader));
		this.body = this._register(instantiationService.createInstance(PanelBody, DEFAULT_PANEL_HEIGHT));
		this.element.appendChild(this.header.element);
		this.element.appendChild(this.body.element);

		// Create and position the sash
		this._sash = this._register(instantiationService.createInstance(Sash, this.element, this, { orientation: Orientation.HORIZONTAL }));


		container.appendChild(this.element);
		this.layout();

		// Handle sash drag events
		this._register(this._sash.onDidStart((dragStart) => {
			const initialHeight = this.body.height;
			const initialY = dragStart.currentY;
			const onDragEvent = this._register(this._sash.onDidChange((dragChange) => {
				const delta = dragChange.currentY - initialY;
				this.body.layout(initialHeight - delta);
			}));

			const onDragEndEvent = this._register(this._sash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));
	}

	layout() {
		this.body.layout(DEFAULT_PANEL_HEIGHT);
		this._sash.layout();
	}

	setState(state: PanelStates) {
		this._state = state;
		this._onDidChangeState.fire(state);
		this.header.showSpinner(state === PanelStates.Loading);
	}

	getHorizontalSashLeft() {
		return 0;
	}

	getHorizontalSashTop() {
		return 0;
	}

	getHorizontalSashWidth() {
		return this.element.offsetWidth;
	}

}


class PanelHeader extends Disposable {

	readonly element: HTMLElement;

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
	private _height: number;
	get height() {
		return this._height;
	}

	constructor(height: number) {
		super();
		this.element = $('.aide-controls-panel-body');

		this._height = height;
		this.layout(height);
		this.element.style.backgroundColor = 'red';
	}

	layout(height: number) {
		this._height = height;
		this.element.style.height = `${height}px`;
	}
}
