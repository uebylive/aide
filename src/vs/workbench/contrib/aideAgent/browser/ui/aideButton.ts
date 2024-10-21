/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventType, EventHelper, IFocusTracker, addDisposableListener, trackFocus, isActiveElement, reset } from '../../../../../base/browser/dom.js';
import { sanitize } from '../../../../../base/browser/dompurify/dompurify.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { renderMarkdown, renderStringAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { IButton, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { getBaseLayerHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Event as BaseEvent, Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString, isMarkdownString, markdownStringEqual } from '../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import './media/aideButton.css';

export class Button extends Disposable implements IButton {

	protected options: Omit<IButtonOptions, 'supportShortLabel'>;
	protected _element: HTMLElement;
	protected _label: string | IMarkdownString = '';
	protected _labelElement: HTMLElement;
	protected _iconElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;

	private _onDidClick = this._register(new Emitter<Event>());
	get onDidClick(): BaseEvent<Event> { return this._onDidClick.event; }

	private _onDidEscape = this._register(new Emitter<Event>());
	get onDidEscape(): BaseEvent<Event> { return this._onDidEscape.event; }

	private focusTracker: IFocusTracker;

	constructor(container: HTMLElement, options: IButtonOptions) {
		super();

		this.options = options;

		this._element = document.createElement('a');
		this._element.classList.add('monaco-button');
		this._element.classList.add('aide-button');
		this._element.tabIndex = 0;
		this._element.setAttribute('role', 'button');

		this._element.classList.toggle('secondary', !!options.secondary);
		const background = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
		const foreground = options.secondary ? options.buttonSecondaryForeground : options.buttonForeground;

		this._element.style.color = foreground || '';
		this._element.style.backgroundColor = background || '';

		this._labelElement = document.createElement('div');
		this._labelElement.classList.add('monaco-button-label');
		this._element.appendChild(this._labelElement);

		if (this.options.supportIcons) {
			this._iconElement = document.createElement('div');
			this._iconElement.classList.add('aide-button-label');
			this._element.appendChild(this._iconElement);
		}

		if (typeof options.title === 'string') {
			this.setTitle(options.title);
		}

		if (typeof options.ariaLabel === 'string') {
			this._element.setAttribute('aria-label', options.ariaLabel);
		}
		container.appendChild(this._element);

		this._register(Gesture.addTarget(this._element));

		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._register(addDisposableListener(this._element, eventType, e => {
				if (!this.enabled) {
					EventHelper.stop(e);
					return;
				}

				this._onDidClick.fire(e);
			}));
		});

		this._register(addDisposableListener(this._element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = false;
			if (this.enabled && (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				this._onDidClick.fire(e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this._onDidEscape.fire(e);
				this._element.blur();
				eventHandled = true;
			}

			if (eventHandled) {
				EventHelper.stop(event, true);
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OVER, e => {
			if (!this._element.classList.contains('disabled')) {
				this.updateBackground(true);
			}
		}));

		this._register(addDisposableListener(this._element, EventType.MOUSE_OUT, e => {
			this.updateBackground(false); // restore standard styles
		}));

		// Also set hover background when button is focused for feedback
		this.focusTracker = this._register(trackFocus(this._element));
		this._register(this.focusTracker.onDidFocus(() => { if (this.enabled) { this.updateBackground(true); } }));
		this._register(this.focusTracker.onDidBlur(() => { if (this.enabled) { this.updateBackground(false); } }));
	}

	public override dispose(): void {
		super.dispose();
		this._element.remove();
	}

	private getContentElements(content: string): HTMLElement[] {
		const elements: HTMLSpanElement[] = [];
		for (let segment of renderLabelWithIcons(content)) {
			if (typeof (segment) === 'string') {
				segment = segment.trim();

				// Ignore empty segment
				if (segment === '') {
					continue;
				}

				// Convert string segments to <span> nodes
				const node = document.createElement('span');
				node.textContent = segment;
				elements.push(node);
			} else {
				elements.push(segment);
			}
		}

		return elements;
	}

	private updateBackground(hover: boolean): void {
		let background;
		if (this.options.secondary) {
			background = hover ? this.options.buttonSecondaryHoverBackground : this.options.buttonSecondaryBackground;
		} else {
			background = hover ? this.options.buttonHoverBackground : this.options.buttonBackground;
		}
		if (background) {
			this._element.style.backgroundColor = background;
		}
	}

	get element(): HTMLElement {
		return this._element;
	}

	set label(value: string | IMarkdownString) {
		if (this._label === value) {
			return;
		}

		if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
			return;
		}

		this._element.classList.add('monaco-text-button');

		if (isMarkdownString(value)) {
			const rendered = renderMarkdown(value, { inline: true });
			rendered.dispose();

			// Don't include outer `<p>`
			const root = rendered.element.querySelector('p')?.innerHTML;
			if (root) {
				// Only allow a very limited set of inline html tags
				const sanitized = sanitize(root, { ADD_TAGS: ['b', 'i', 'u', 'code', 'span'], ALLOWED_ATTR: ['class'], RETURN_TRUSTED_TYPE: true });
				this._labelElement.innerHTML = sanitized as unknown as string;
			} else {
				reset(this._labelElement);
			}
		} else {
			if (this.options.supportIcons) {
				reset(this._labelElement, ...this.getContentElements(value));
			} else {
				this._labelElement.textContent = value;
			}
		}

		let title: string = '';
		if (typeof this.options.title === 'string') {
			title = this.options.title;
		} else if (this.options.title) {
			title = renderStringAsPlaintext(value);
		}

		this.setTitle(title);

		if (typeof this.options.ariaLabel === 'string') {
			this._element.setAttribute('aria-label', this.options.ariaLabel);
		} else if (this.options.ariaLabel) {
			this._element.setAttribute('aria-label', title);
		}

		this._label = value;
	}

	get label(): string | IMarkdownString {
		return this._label;
	}

	set icon(icon: ThemeIcon) {
		if (this._iconElement) {
			this._iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	set enabled(value: boolean) {
		if (value) {
			this._element.classList.remove('disabled');
			this._element.setAttribute('aria-disabled', String(false));
			this._element.tabIndex = 0;
		} else {
			this._element.classList.add('disabled');
			this._element.setAttribute('aria-disabled', String(true));
		}
	}

	get enabled() {
		return !this._element.classList.contains('disabled');
	}

	set checked(value: boolean) {
		if (value) {
			this._element.classList.add('checked');
			this._element.setAttribute('aria-checked', 'true');
		} else {
			this._element.classList.remove('checked');
			this._element.setAttribute('aria-checked', 'false');
		}
	}

	get checked() {
		return this._element.classList.contains('checked');
	}

	setTitle(title: string) {
		if (!this._hover && title !== '') {
			this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('mouse'), this._element, title));
		} else if (this._hover) {
			this._hover.update(title);
		}
	}

	focus(): void {
		this._element.focus();
	}

	hasFocus(): boolean {
		return isActiveElement(this._element);
	}
}
