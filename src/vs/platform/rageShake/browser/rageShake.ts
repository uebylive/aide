/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { addDisposableListener } from '../../../base/browser/dom.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { SystemInfo } from '../../diagnostics/common/diagnostics.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { IProcessMainService } from '../../process/common/process.js';
import { defaultButtonStyles } from '../../theme/browser/defaultStyles.js';
import { IRageShakeService } from '../common/rageShake.js';
import { RAGESHAKE_CARD_VISIBLE } from '../common/rageShakeContextKeys.js';
import './media/rageShake.css';

const $ = dom.$;


enum RageShakeView {
	Start,
	Issue,
	Idea,
	Other
}


const views: { destination: RageShakeView; label: string; codicon: ThemeIcon }[] = [
	{ destination: RageShakeView.Issue, label: localize('rageShakeReportIssue', "Report an issue"), codicon: Codicon.warning },
	{ destination: RageShakeView.Idea, label: localize('rageShakeShareIdea', "Share an idea"), codicon: Codicon.lightBulb },
	{ destination: RageShakeView.Other, label: localize('rageShakeShareOther', "Tell us anything"), codicon: Codicon.commentDiscussion },
];

export class RageShakeService extends Disposable implements IRageShakeService {
	_serviceBrand: undefined;

	private isVisible: IContextKey<boolean>;

	private cardElement: HTMLElement;
	private bodyElement: HTMLElement;
	private backButton: Button;
	private headerTitleElement: HTMLElement;

	private screenShotButton: Button | undefined;
	private screenShotBlob: Blob | null = null;

	private systemInformationButton: Button | undefined;
	private systemInfo: SystemInfo | undefined;

	private currentView: RageShakeView = RageShakeView.Start;


	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IProcessMainService private readonly processMainService: IProcessMainService,
	) {
		super();

		this.isVisible = RAGESHAKE_CARD_VISIBLE.bindTo(this.contextKeyService);

		const container = this.layoutService.activeContainer;
		const card = this.cardElement = dom.append(container, $('.rageShake-card'));
		const header = card.appendChild($('header.rageShake-card-header'));
		const backButton = this.backButton = this._register(this.instantiationService.createInstance(Button, header, {}));
		backButton.icon = Codicon.arrowLeft;

		this.headerTitleElement = header.appendChild($('.rageShake-card-title'));

		const closeButton = this._register(this.instantiationService.createInstance(Button, header, {}));
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

	private async getScreenShot() {
		const spinner = $('span.codicon.codicon-loading', { ariaHidden: true });
		this.screenShotButton?.element.prepend(spinner);


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
			this.screenShotButton?.element.removeChild(spinner);
			store.dispose();
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
			}
		}

		//const grabber = this._register(this.instantiationService.createInstance(ScreenShotGrabber));
		//grabber.grabScreenShot();
	}

	private async getSystemInformation() {
		this.systemInfo = await this.processMainService.$getSystemInfo();
	}

	private navigate(state: RageShakeView) {
		this.currentView = state;
		switch (state) {
			case RageShakeView.Start:
				this.showStart();
				break;
			case RageShakeView.Issue:
				this.showIssue();
				break;
			case RageShakeView.Idea:
				this.showIdea();
				break;
			case RageShakeView.Other:
				this.showOther();
				break;
		}
	}

	private showStart() {
		this.headerTitleElement.textContent = localize('rageShakeStart', "What's on your mind?");
		this.setVisibilityWithoutLayoutShift(false, this.backButton.element);
		dom.clearNode(this.bodyElement);

		const list = this.bodyElement.appendChild($('ul.rageShake-list'));

		for (const { destination, label, codicon } of views) {
			const listElement = list.appendChild($('li'));
			const button = this._register(this.instantiationService.createInstance(Button, listElement, { secondary: true, ...defaultButtonStyles }));
			button.label = label;
			button.element.prepend($(`span.rageShake-icon.codicon${ThemeIcon.asCSSSelector(codicon)}`, { ariaHidden: true }));
			this._register(button.onDidClick(() => this.navigate(destination)));
		}
	}

	private setVisibilityWithoutLayoutShift(visible: boolean, element: HTMLElement) {
		element.style.transition = 'opacity 200ms';
		if (visible) {
			element.style.opacity = '1';
			this._register(addDisposableListener(element, 'transitionend', () => {
				element.style.visibility = 'visible';
			}));
			element.ariaHidden = 'false';
		} else {
			element.style.opacity = '0';
			this._register(addDisposableListener(element, 'transitionend', () => {
				element.style.visibility = 'hidden';
			}));
			element.ariaHidden = 'true';
		}
	}

	private showIssue() {
		this.headerTitleElement.textContent = localize('rageShakeReportIssue', "Report an issue");
		this.setVisibilityWithoutLayoutShift(true, this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeReportIssue.placeholder', "Describe your issue");

		const attachments = this.bodyElement.appendChild($('div.rageShake-issue-attachments'));

		if (this.screenShotButton) {
			this.screenShotButton.dispose();
		}
		const screenshotButton = this.screenShotButton = this._register(this.instantiationService.createInstance(Button, attachments, { secondary: true, ...defaultButtonStyles }));
		screenshotButton.label = localize('rageShakeReportIssue.takeScreenShot', "Take a screenshot");
		this._register(screenshotButton.onDidClick(() => this.getScreenShot()));


		if (this.systemInformationButton) {
			this.systemInformationButton.dispose();
		}

		this.systemInformationButton = this._register(this.instantiationService.createInstance(Button, attachments, { secondary: true, ...defaultButtonStyles }));
		this.systemInformationButton.label = localize('rageShakeReportIssue.getSystemInformation', "Attach system information");
		this._register(this.systemInformationButton.onDidClick(() => this.getSystemInformation()));

		const issueButton = this._register(this.instantiationService.createInstance(Button, this.bodyElement, defaultButtonStyles));
		issueButton.label = localize('rageShakeReportIssue', "Report an issue");
	}

	private showIdea() {
		this.headerTitleElement.textContent = localize('rageShakeShareIdea', "Share an idea");
		this.setVisibilityWithoutLayoutShift(true, this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeShareIdea.placeholder', "Share your idea");
	}

	private showOther() {
		this.headerTitleElement.textContent = localize('rageShakeShareOther', "Tell us anything");
		this.setVisibilityWithoutLayoutShift(true, this.backButton.element);
		dom.clearNode(this.bodyElement);
		const textArea = this.bodyElement.appendChild(document.createElement('textarea'));
		textArea.placeholder = localize('rageShakeShareOther.placeholder', "Tell us something else");
	}

	private goBack() {
		this.navigate(RageShakeView.Start);
	}

	private async show() {
		dom.show(this.cardElement);
		this.navigate(this.currentView);
	}

	private hide() {
		dom.hide(this.cardElement);
	}
}
