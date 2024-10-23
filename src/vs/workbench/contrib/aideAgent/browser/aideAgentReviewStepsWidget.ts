/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as dom from '../../../../base/browser/dom.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

interface ReviewButton {
	button: Button;
	textLabelElement: HTMLElement;
}

export class ReviewStepsWidget extends Disposable {

	private saveButton: ReviewButton;
	private dropButton: ReviewButton;
	private diagramContainer: HTMLElement;

	_currentStep: number;

	set currentStep(step: number) {
		this._currentStep = step;
		this.rerender();
	}

	constructor(
		currentStep: number,
		totalSteps: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._currentStep = currentStep;

		const elements = dom.h('.aide-review-steps-widget@root', [
			dom.h('.aide-review-steps-widget-header@header'),
			dom.h('.aide-review-steps-widget-content@content', [
				dom.h('.aide-review-steps-diagram-container@diagramContainer'),
				dom.h('.aide-review-steps-buttons-container@buttonsContainer'),
			]),
		]);

		this.diagramContainer = elements.diagramContainer;

		this.saveButton = this.makeButton(elements.buttonsContainer, `Save changes up to step ${this._currentStep}`, Codicon.checkAll);
		this.dropButton = this.makeButton(elements.buttonsContainer, `Drop step ${this._currentStep} and following steps`, Codicon.trash);

		this._register(this.saveButton.button.onDidClick(() => {
			//this.planReviewService.saveChanges(this.currentStep);
			console.log(`Save changes up to step ${this._currentStep}`);
		}));

		this._register(dom.addDisposableListener(this.saveButton.button.element, dom.EventType.FOCUS, async (e: FocusEvent) => {
			this.showDiagram('save');
		}));

		this._register(dom.addDisposableListener(this.saveButton.button.element, dom.EventType.BLUR, async (e: FocusEvent) => {
			this.showDiagram('drop');
		}));

		this._register(this.dropButton.button.onDidClick(() => {
			//this.planReviewService.dropChanges(this.currentStep);
			console.log(`Drop changes up to step ${this._currentStep}`);
		}));
	}

	private makeButton(container: HTMLElement, label: string, icon: ThemeIcon): ReviewButton {
		const button = this._register(this.instantiationService.createInstance(Button, container, {}));
		button.label = label;
		const textLabelElement = button.element.appendChild(dom.$('.aide-review-steps-button-label'));
		textLabelElement.textContent = label;
		button.element.appendChild(dom.$(`.codicon.${ThemeIcon.asClassName(icon)}`));
		return { button, textLabelElement };
	}

	private showDiagram(type: 'idle' | 'save' | 'drop') {
		this.diagramContainer.classList.remove('show-save', 'show-drop');
		if (type === 'save') {
			this.diagramContainer.classList.add('show-save');
		} else if (type === 'drop') {
			this.diagramContainer.classList.add('show');
		}
	}

	private rerender() {
		const saveLabel = `Save changes up to step ${this._currentStep}`;
		this.saveButton.button.label = saveLabel;
		this.saveButton.textLabelElement.textContent = saveLabel;

		const dropLabel = `Drop step ${this._currentStep} and following steps`;
		this.dropButton.button.label = dropLabel;
		this.dropButton.textLabelElement.textContent = dropLabel;
	}

}
