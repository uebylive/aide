/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { addDisposableListener } from '../../../base/browser/dom.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../theme/browser/defaultStyles.js';
import { IRageShakeService } from '../common/rageShake.js';
import { RAGESHAKE_CARD_VISIBLE } from '../common/rageShakeContextKeys.js';
import './media/rageShake.css';

const $ = dom.$;


enum State {
	Start,
	Issue,
	Idea,
	Other
}

export class RageShakeService extends Disposable implements IRageShakeService {
	_serviceBrand: undefined;

	private isVisible: IContextKey<boolean>;

	private cardElement: HTMLElement;
	private bodyElement: HTMLElement;
	private backButton: Button;
	private headerTitleElement: HTMLElement;


	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super();

		this.isVisible = RAGESHAKE_CARD_VISIBLE.bindTo(this.contextKeyService);

		const container = this.layoutService.activeContainer;
		const card = this.cardElement = dom.append(container, $('.rageShake-card'));
		const header = card.appendChild($('header.rageShake-card-header'));
		const backButton = this.backButton = this._register(this.instantiationService.createInstance(Button, header, defaultButtonStyles));
		backButton.icon = Codicon.arrowLeft;

		this.headerTitleElement = card.appendChild($('.rageShake-card-title'));

		const closeButton = this._register(this.instantiationService.createInstance(Button, header, defaultButtonStyles));
		closeButton.icon = Codicon.close;

		this.bodyElement = card.appendChild($('.rageShake-card-body'));

		this._register(this.backButton.onDidClick(() => this.goBack()));
	}


	toggle() {
		if (!this.isVisible.get()) {
			this.show();
			this.isVisible.set(true);
		} else {
			this.hide();
			this.isVisible.set(false);
		}
	}

	private async getScreenShot(): Promise<ArrayBufferLike | undefined> {
		// Gets a screenshot from the browser. This gets the screenshot via the browser's display
		// media API which will typically offer a picker of all available screens and windows for
		// the user to select. Using the video stream provided by the display media API, this will
		// capture a single frame of the video and convert it to a JPEG image.
		const store = new DisposableStore();

		// Create a video element to play the captured screen source
		const video = document.createElement('video');
		store.add(toDisposable(() => video.remove()));
		let stream: MediaStream | undefined;
		try {
			// Create a stream from the screen source (capture screen without audio)
			stream = await navigator.mediaDevices.getDisplayMedia({
				audio: false,
				video: true
			});

			// Set the stream as the source of the video element
			video.srcObject = stream;
			video.play();

			// Wait for the video to load properly before capturing the screenshot
			await Promise.all([
				new Promise<void>(r => store.add(addDisposableListener(video, 'loadedmetadata', () => r()))),
				new Promise<void>(r => store.add(addDisposableListener(video, 'canplaythrough', () => r())))
			]);

			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				return undefined;
			}

			// Draw the portion of the video (x, y) with the specified width and height
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			// Convert the canvas to a Blob (JPEG format), use .95 for quality
			const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95));
			if (!blob) {
				throw new Error('Failed to create blob from canvas');
			}

			// Convert the Blob to an ArrayBuffer
			return blob.arrayBuffer();

		} catch (error) {
			console.error('Error taking screenshot:', error);
			return undefined;
		} finally {
			store.dispose();
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
			}
		}

	}

	private navigate(state: State) {
		switch (state) {
			case State.Start:
				this.showStart();
				break;
			case State.Issue:
				this.showIssue();
				break;
			case State.Idea:
				this.showIdea();
				break;
			case State.Other:
				this.showOther();
				break;
		}
	}

	private showStart() {
		this.headerTitleElement.textContent = localize('rageShakeStart', "What's on your mind?");
		dom.hide(this.backButton.element);
		dom.clearNode(this.bodyElement);
		const issueButton = this._register(this.instantiationService.createInstance(Button, this.bodyElement, defaultButtonStyles));
		issueButton.label = localize('rageShakeReportIssue', "Report an issue");
		this._register(issueButton.onDidClick(() => this.navigate(State.Issue)));

		const ideaBtton = this._register(this.instantiationService.createInstance(Button, this.bodyElement, defaultButtonStyles));
		ideaBtton.label = localize('rageShakeShareIdea', "Share an idea");
		this._register(ideaBtton.onDidClick(() => this.navigate(State.Idea)));

		const otherButton = this._register(this.instantiationService.createInstance(Button, this.bodyElement, defaultButtonStyles));
		otherButton.label = localize('rageShakeShareOther', "Tell us anything");
		this._register(otherButton.onDidClick(() => this.navigate(State.Other)));
	}

	private showIssue() {
		this.headerTitleElement.textContent = localize('rageShakeReportIssue', "Report an issue");
		dom.show(this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeReportIssue.placeholder', "Describe your issue");

		const issueButton = this._register(this.instantiationService.createInstance(Button, this.bodyElement, defaultButtonStyles));
		issueButton.label = localize('rageShakeReportIssue', "Report an issue");
	}

	private showIdea() {
		this.headerTitleElement.textContent = localize('rageShakeShareIdea', "Share an idea");
		dom.show(this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeShareIdea.placeholder', "Share your idea");
	}

	private showOther() {
		this.headerTitleElement.textContent = localize('rageShakeShareOther', "Tell us anything");
		dom.show(this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeShareOther.placeholder', "Tell us something else");
	}

	private goBack() {
		this.navigate(State.Start);
	}

	private async show() {
		dom.show(this.cardElement);

	}

	private hide() {
		dom.hide(this.cardElement);
	}
}
