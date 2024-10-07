/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../base/browser/fonts.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Heroicon } from '../../../../browser/heroicon.js';
import { Spinner } from '../../../../browser/spinner.js';
import { getSimpleEditorOptions, getSimpleCodeEditorWidgetOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { AgentMode, IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IAideAgentService, IChatPlanStep } from '../../common/aideAgentService.js';
import { IChatContentPart } from './aideAgentContentParts.js';
import './media/aideAgentPlanStepPart.css';

const $ = dom.$;

export enum StepState {
	GeneratingPlan = 'GeneratingPlan',
	Idle = 'Idle',
	ApplyingEdits = 'ApplyingEdits',
	Reviewing = 'Reviewing',
	Error = 'Error'
}
export type IStepState = `${StepState}`;

// TODO(@g-danna) Add intl
export class ChatPlanStepPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly state: IStepState = StepState.Idle;
	private readonly willBeDropped = false;

	private feedbackMode = false;
	private showDescription = false;

	private reviewButtonsElement: HTMLElement; // Accept/reject changes
	private planButtonsElement: HTMLElement; // Delete step/start changes implementation
	private loadingButtonsElement: HTMLElement; // Stop plan generation or edits application
	private loadingButton: Button;

	private enterFeedbackButton: Button;
	private cancelFeedbackButton: Button;
	private submitFeedbackButton: Button;
	private feedbackEditorElement: HTMLElement;
	private feedbackEditor: CodeEditorWidget;

	static readonly INPUT_SCHEME = 'planStepFeedbackInput';
	readonly inputUri: URI;


	constructor(
		readonly step: IChatPlanStep,
		readonly descriptionPart: IChatContentPart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAideAgentService private readonly chatService: IAideAgentService,
	) {
		super();
		this.inputUri = URI.parse(`${ChatPlanStepPart.INPUT_SCHEME}:${step.sessionId}-${step.index}`);

		this.domNode = $('.plan-step');
		if (step.isLast) {
			this.domNode.classList.add('plan-step-last');
		}

		// TIMELINE

		const stepNumber = step.index + 1;
		const timelineElement = $('.plan-step-timeline');
		this.domNode.appendChild(timelineElement);
		// Contains step number and allows removing this step
		const stepIndicator = $('.plan-step-indicator');
		timelineElement.appendChild(stepIndicator);
		stepIndicator.textContent = `${stepNumber}`;
		//const stepIndicatorButton = this._register(this.instantiationService.createInstance(Button, timelineElement, { title: `Step ${stepNumber}` }));
		//stepIndicatorButton.element.classList.add('plan-step-indicator');
		//stepIndicatorButton.element.textContent = `${stepNumber}`;
		const stepTimeline = $('.plan-step-timeline-line');
		timelineElement.appendChild(stepTimeline);
		// const addStepButton = this._register(this.instantiationService.createInstance(Button, timelineElement, { title: 'Add step' }));
		// addStepButton.element.classList.add('plan-step-add');

		const contentElement = $('.plan-step-content');
		this.domNode.appendChild(contentElement);

		// HEADER

		const headerElement = $('.plan-step-header');
		contentElement.appendChild(headerElement);

		// Contains plan step title and can disclose the description
		const summaryButton = this._register(this.instantiationService.createInstance(Button, headerElement, { title: step.title }));
		summaryButton.element.classList.add('plan-step-summary');
		summaryButton.element.textContent = step.title;
		this._register(summaryButton.onDidClick(() => {
			this.showDescription = !this.showDescription;
			this.rerender();
		}));

		this.planButtonsElement = $('.plan-step-plan-buttons');
		headerElement.appendChild(this.planButtonsElement);

		const implementButton = this._register(this.instantiationService.createInstance(Button, this.planButtonsElement, { title: 'Implement changes' }));
		implementButton.element.classList.add('plan-step-implement-until');
		this._register(this.instantiationService.createInstance(Heroicon, implementButton.element, 'micro/bolt'));

		// probably works, we do need to set the mode as plan
		implementButton.onDidClick(() => {
			this.chatService.sendRequest(step.sessionId, `@execute ${step.index}`, {
				agentMode: AgentMode.Plan,
			});
			mockEditsService.implementStep(step.index);
		});

		const dropPlanStep = this._register(this.instantiationService.createInstance(Button, this.planButtonsElement, { title: 'Drop plan step' }));
		this._register(this.instantiationService.createInstance(Heroicon, dropPlanStep.element, 'micro/trash'));
		dropPlanStep.element.classList.add('plan-step-drop-step');

		dropPlanStep.onDidClick(() => {
			this.chatService.sendRequest(step.sessionId, `@drop ${step.index}`, {
				agentMode: AgentMode.Plan,
			});
			mockPlanService.dropPlanStep(step.index);
		});

		this.reviewButtonsElement = $('.plan-step-review-buttons');
		headerElement.appendChild(this.reviewButtonsElement);

		const acceptChangesButton = this._register(this.instantiationService.createInstance(Button, this.reviewButtonsElement, { title: 'Accept changes' }));
		acceptChangesButton.element.classList.add('plan-step-accept-changes');
		this._register(this.instantiationService.createInstance(Heroicon, acceptChangesButton.element, 'micro/check'));

		acceptChangesButton.onDidClick(() => {
			mockEditsService.acceptEdits(step.index);
		});

		const rejectChangesButton = this._register(this.instantiationService.createInstance(Button, this.reviewButtonsElement, { title: 'Reject changes' }));
		this._register(this.instantiationService.createInstance(Heroicon, rejectChangesButton.element, 'micro/x-mark'));
		rejectChangesButton.element.classList.add('plan-step-reject-changes');

		rejectChangesButton.onDidClick(() => {
			mockEditsService.rejectEdits(step.index);
		});

		this.loadingButtonsElement = $('.plan-step-loading-buttons');
		headerElement.appendChild(this.loadingButtonsElement);
		this.loadingButton = this._register(this.instantiationService.createInstance(Button, this.loadingButtonsElement, { title: 'Loading' }));
		this.loadingButton.onDidClick(() => {
			if (this.state === StepState.GeneratingPlan) {
				mockPlanService.stopGeneratingStep(step.index);
			} else if (this.state === StepState.ApplyingEdits) {
				mockEditsService.stopGeneretingEdits(step.index);
			}
		});


		this.loadingButton.element.classList.add('plan-step-stop-button');
		const spinnerIcon = this._register(this.instantiationService.createInstance(Spinner, this.loadingButton.element));
		spinnerIcon.svg.classList.add('plan-step-spinner-icon');
		const stopIcon = this._register(this.instantiationService.createInstance(Heroicon, this.loadingButton.element, 'micro/stop'));
		stopIcon.svg.classList.add('plan-step-stop-icon');


		switch (this.state) {
			case StepState.GeneratingPlan:
			case StepState.ApplyingEdits:
				this.showLoadingButton();
				break;
			case StepState.Idle:
				this.showPlanButtons();
				break;
			case StepState.Reviewing:
				this.showReviewButtons();
				break;
		}

		// TODO(@g-danna) Add description element

		contentElement.appendChild(this.descriptionPart.domNode);
		this.descriptionPart.domNode.classList.add('plan-step-description');

		// FEEDBACK

		const feedbackElement = $('.plan-step-feedback');
		contentElement.appendChild(feedbackElement);

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(contentElement));
		this.feedbackEditorElement = $('.plan-step-feedback-editor');
		feedbackElement.appendChild(this.feedbackEditorElement);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));
		const defaultOptions = getSimpleEditorOptions(this.configurationService);
		const options: IEditorConstructionOptions = {
			...defaultOptions,
			overflowWidgetsDomNode: this.feedbackEditorElement,
			readOnly: false,
			ariaLabel: localize('chatInput', "Edit code"),
			fontFamily: DEFAULT_FONT_FAMILY,
			fontSize: 13,
			lineHeight: 20,
			padding: { top: 8, bottom: 8 },
			cursorWidth: 1,
			wrappingStrategy: 'advanced',
			bracketPairColorization: { enabled: false },
			suggest: {
				showIcons: false,
				showSnippets: false,
				showWords: true,
				showStatusBar: false,
				insertMode: 'replace',
			},
			scrollbar: { ...(defaultOptions.scrollbar ?? {}), vertical: 'hidden' }
		};
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID]));
		this.feedbackEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this.feedbackEditorElement, options, editorOptions));
		let editorModel = this.modelService.getModel(this.inputUri);
		if (!editorModel) {
			editorModel = this.modelService.createModel('', null, this.inputUri, true);
			this._register(editorModel);
		}
		this.feedbackEditor.setModel(editorModel);
		this.feedbackEditor.render();

		this._register(this.feedbackEditor.onDidChangeModelContent(() => {
			this.layoutFeedbackEditor();
		}));
		this.layoutFeedbackEditor();


		this.submitFeedbackButton = this._register(this.instantiationService.createInstance(Button, feedbackElement, { title: 'Regenerate step' }));
		this.submitFeedbackButton.onDidClick(() => {
			const feedbackValue = this.feedbackEditor.getModel()?.getValue();
			if (this.state === StepState.GeneratingPlan) {
				mockPlanService.feedbackForPlanStep(step.index, feedbackValue);
			} else if (this.state === StepState.ApplyingEdits || this.state === StepState.Idle) {
				mockEditsService.feedbackForStepEdits(step.index, feedbackValue);
				if (this.state === StepState.ApplyingEdits) {
					mockEditsService.stopGeneretingEdits(step.index);
				}
			}
		});

		this.submitFeedbackButton.element.textContent = 'Retry';
		this.submitFeedbackButton.element.classList.add('plan-step-submit-feedback');
		const retryIcon = this._register(this.instantiationService.createInstance(Heroicon, this.submitFeedbackButton.element, 'micro/arrow-path'));
		retryIcon.svg.classList.add('plan-step-retry-icon');


		this.enterFeedbackButton = this._register(this.instantiationService.createInstance(Button, feedbackElement, { title: 'Enter feedback' }));
		this._register(this.instantiationService.createInstance(Heroicon, this.enterFeedbackButton.element, 'micro/pencil'));
		this.enterFeedbackButton.element.classList.add('plan-step-enter-feedback');
		this._register(this.enterFeedbackButton.onDidClick(() => {
			if (!this.feedbackMode) {
				this.enterFeedbackMode();
			}
		}));

		this.cancelFeedbackButton = this._register(this.instantiationService.createInstance(Button, feedbackElement, { title: 'Cancel feedback' }));
		this._register(this.instantiationService.createInstance(Heroicon, this.cancelFeedbackButton.element, 'micro/x-mark'));
		this.cancelFeedbackButton.element.classList.add('plan-step-cancel-feedback');
		this._register(this.cancelFeedbackButton.onDidClick(() => {
			if (this.feedbackMode) {
				this.exitFeedbackMode();
			}
		}));

		if (this.feedbackMode) {
			this.enterFeedbackMode();
		} else {
			this.exitFeedbackMode();
		}

		this.rerender();
	}

	rerender() {
		if (this.willBeDropped) {
			this.domNode.classList.add('plan-step-will-be-dropped');
		} else {
			this.domNode.classList.remove('plan-step-will-be-dropped');
		}

		if (this.showDescription) {
			dom.show(this.descriptionPart.domNode);
		} else {
			dom.hide(this.descriptionPart.domNode);
		}

		this.layoutFeedbackEditor();
	}


	private showReviewButtons() {
		dom.show(this.reviewButtonsElement);
		dom.hide(this.loadingButtonsElement, this.planButtonsElement);
	}

	private showLoadingButton() {
		dom.show(this.loadingButtonsElement);
		dom.hide(this.reviewButtonsElement, this.planButtonsElement);
	}

	private showPlanButtons() {
		dom.show(this.planButtonsElement);
		dom.hide(this.reviewButtonsElement, this.loadingButtonsElement);
	}


	private layoutFeedbackEditor() {
		const currentHeight = Math.max(this.feedbackEditor.getContentHeight(), 32);
		this.feedbackEditor.layout({ height: currentHeight, width: this.feedbackEditorElement.clientWidth });

		const model = this.feedbackEditor.getModel();
		const inputHasText = !!model && model.getValue().trim().length > 0;
		this.feedbackEditorElement.classList.toggle('has-text', inputHasText);
	}

	private enterFeedbackMode() {
		this.feedbackMode = true;
		dom.show(this.cancelFeedbackButton.element);
		dom.show(this.submitFeedbackButton.element);
		dom.hide(this.enterFeedbackButton.element);
		this.feedbackEditor.focus();
	}

	private exitFeedbackMode() {
		this.feedbackMode = false;
		dom.show(this.enterFeedbackButton.element);
		dom.hide(this.submitFeedbackButton.element);
		dom.hide(this.cancelFeedbackButton.element);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'planStep' && other.description === this.step.description;
	}
}

const mockPlanService = {
	stopGeneratingStep(index: number) {
		console.log('stopGeneratingStep', index);
	},
	feedbackForPlanStep(index: number, feedback?: string) {
		console.log('feedbackForPlanStep', index, feedback || 'No feedback');
	},
	dropPlanStep(index: number) {
		console.log('dropPlanStep', index);
	}
};

const mockEditsService = {
	implementStep(index: number) {
		console.log('implementStep', index);
	},
	stopGeneretingEdits(index: number) {
		console.log('stopGeneretingEdits', index);
	},
	acceptEdits(index: number) {
		console.log('acceptEdits', index);
	},
	rejectEdits(index: number) {
		console.log('rejectEdits', index);
	},
	feedbackForStepEdits(index: number, feedback?: string) {
		console.log('feedbackForPlanEdits', index, feedback || 'No feedback');
	}
};
