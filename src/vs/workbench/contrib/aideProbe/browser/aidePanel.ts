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

export enum PanelStates {
	Idle = 'idle',
	Loading = 'loading',
}


export abstract class AidePanel extends Disposable {
	private readonly element: HTMLElement;
	private bottomSash: Sash;
	private leftSash: Sash;
	private _height: number = 200;
	private _width: number = 200;

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


	private _onDidResize = this._register(new Emitter<number>());
	readonly onDidResize: Event<number> = this._onDidResize.event;


	constructor(private readonly reference: HTMLElement, instantiationService: IInstantiationService, initialSize?: IDimension) {
		super();
		this.element = $('.aide-panel');
		// TODO(@g-danna): Replace this with popover
		this.reference.appendChild(this.element);

		this.header = this._register(instantiationService.createInstance(PanelHeader));
		this.body = this._register(instantiationService.createInstance(PanelBody));
		this.element.appendChild(this.header.element);
		this.element.appendChild(this.body.element);

		if (initialSize) {
			this._height = initialSize.height;
			this._width = initialSize.width;
		}

		this.leftSash = instantiationService.createInstance(Sash, this.element, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL });
		this.bottomSash = instantiationService.createInstance(Sash, this.element, { getHorizontalSashTop: () => this.element.offsetHeight }, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.South });
		this.bottomSash.orthogonalStartSash = this.leftSash;

		this.layout(this._height, this._width);

		this._register(this.bottomSash.onDidStart((dragStart) => {
			const initialBodyHeight = this.body.height;
			const initialY = dragStart.currentY;
			const onDragEvent = this._register(this.bottomSash.onDidChange((dragChange) => {
				const delta = dragChange.currentY - initialY;
				const newBodyHeight = initialBodyHeight + delta;
				this.layout(newBodyHeight, this._width);
				this._onDidResize.fire(newBodyHeight);
			}));

			const onDragEndEvent = this._register(this.bottomSash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));

		this._register(this.leftSash.onDidStart((dragStart) => {
			const initialWidth = this.body.width;
			const initialX = dragStart.currentX;
			const onDragEvent = this._register(this.leftSash.onDidChange((dragChange) => {
				const delta = dragChange.currentX - initialX;
				const newWidth = initialWidth - delta;
				this.layout(this.body.height, newWidth);
				this._onDidResize.fire(newWidth);
			}));

			const onDragEndEvent = this._register(this.leftSash.onDidEnd(() => {
				onDragEvent.dispose();
				onDragEndEvent.dispose();
			}));
		}));
	}

	layout(bodyHeight: number, width: number) {
		this.body.layout(bodyHeight, width);
		this._height = this.body.height + this.header.height;
		this._width = width;
		this.bottomSash.layout();
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
	private _height: number = 36;
	get height() {
		return this._height;
	}

	constructor(initialText?: string) {
		super();
		this.element = $('.aide-panel-header');
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
		this.element = $('.aide-panel-body');
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
