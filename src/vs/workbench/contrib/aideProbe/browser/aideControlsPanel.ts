/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { IHorizontalSashLayoutProvider, ISashEvent, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export enum PanelStates {
	Idle = 'idle',
	Loading = 'loading',
}


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


	constructor(parent: HTMLElement, instantiationService: IInstantiationService) {
		super();

		this.element = $('.aide-controls-panel');
		parent.appendChild(this.element);
		this.header = this._register(instantiationService.createInstance(PanelHeader));
		this.body = this._register(instantiationService.createInstance(PanelBody));
		this.element.appendChild(this.header.element);
		this.element.appendChild(this.body.element);


		// Create and position the sash
		this._sash = this._register(instantiationService.createInstance(Sash, this.element, this, { orientation: Orientation.HORIZONTAL }));
		this._sash.layout();

		// Handle sash drag events
		this._register(this._sash.onDidStart(this.onSashDragStart));
	}

	setState(state: PanelStates) {
		this._state = state;
		this._onDidChangeState.fire(state);
		this.header.showSpinner(state === PanelStates.Loading);
	}

	private onSashDragStart(e: ISashEvent): void {
		const initialY = e.currentY;

		const onDragEvent = this._register(this._sash.onDidChange((e) => {
			const delta = e.currentY - initialY;
			console.log(delta);
			this.body.layout(this.body.height + delta);
		}));

		const onDragEndEvent = this._register(this._sash.onDidEnd(() => {
			onDragEvent.dispose();
			onDragEndEvent.dispose();
		}));

	}

	getHorizontalSashLeft() {
		return 0;
	}

	getHorizontalSashTop() {
		return this.element.offsetHeight;
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

	public override dispose(): void {
		super.dispose();
		this.element.remove();
	}
}


const DEFAULT_PANEL_HEIGHT = 200;

class PanelBody extends Disposable {

	readonly element: HTMLElement;
	private _height = DEFAULT_PANEL_HEIGHT;
	get height() {
		return this._height;
	}

	constructor() {
		super();
		this.element = $('.aide-controls-panel-body');
		this.layout(this._height);
		this.element.style.backgroundColor = 'red';
	}

	layout(height: number) {
		this._height = height;
		this.element.style.height = `${height}px`;
	}

	public override dispose(): void {
		super.dispose();
		this.element.remove();
	}
}
