/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../common/event.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { $, addDisposableListener, EventType } from '../../dom.js';
import { IKeyboardEvent, StandardKeyboardEvent } from '../../keyboardEvent.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { Widget } from '../widget.js';
import './switch.css';

export interface ISwitchOpts {
	readonly title: string;
	readonly isChecked: boolean;
	readonly notFocusable?: boolean;
	readonly hoverDelegate?: IHoverDelegate;
}

export class Switch extends Widget {
	private readonly _onChange = this._register(new Emitter<boolean>());
	readonly onChange: Event<boolean> = this._onChange.event;

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _opts: ISwitchOpts;
	readonly domNode: HTMLElement;
	private _checked: boolean;
	private _enabled: boolean = true;

	constructor(opts: ISwitchOpts) {
		super();

		this._opts = opts;
		this._checked = this._opts.isChecked;

		this.domNode = $('.monaco-switch');
		if (this._checked) {
			this.domNode.classList.add('checked');
		}

		// Create inner circle
		this.domNode.appendChild($('.switch-inner'));

		if (!this._opts.notFocusable) {
			this.domNode.tabIndex = 0;
		}
		this.domNode.setAttribute('role', 'switch');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this._register(addDisposableListener(this.domNode, EventType.CLICK, (e) => {
			if (this._enabled) {
				this.checked = !this._checked;
				this._onChange.fire(false);
				e.preventDefault();
			}
		}));

		this._register(addDisposableListener(this.domNode, EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
				this.checked = !this._checked;
				this._onChange.fire(true);
				e.preventDefault();
			} else {
				this._onKeyDown.fire(event);
			}
		}));
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(newIsChecked: boolean) {
		this._checked = newIsChecked;
		this.domNode.classList.toggle('checked', this._checked);
		this.domNode.setAttribute('aria-checked', String(this._checked));
	}

	focus(): void {
		this.domNode.focus();
	}

	enable(): void {
		this._enabled = true;
		this.domNode.classList.remove('disabled');
		if (!this._opts.notFocusable) {
			this.domNode.tabIndex = 0;
		}
	}

	disable(): void {
		this._enabled = false;
		this.domNode.classList.add('disabled');
		this.domNode.tabIndex = -1;
	}
}
