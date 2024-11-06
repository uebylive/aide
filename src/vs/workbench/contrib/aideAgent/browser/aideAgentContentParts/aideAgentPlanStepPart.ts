/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Spinner } from '../../../../browser/spinner.js';
import { CONTEXT_IN_CHAT_PLAN_STEP } from '../../common/aideAgentContextKeys.js';
import { AgentMode, IChatProgressRenderableResponseContent } from '../../common/aideAgentModel.js';
import { IAideAgentService, IChatPlanStep } from '../../common/aideAgentService.js';
import { IChatContentPart } from './aideAgentContentParts.js';
import { ChatMarkdownContentPart } from './aideAgentMarkdownContentPart.js';
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

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidFocus = this._register(new Emitter<number>());
	readonly onDidFocus = this._onDidFocus.event;

	private inChatPlanStep: IContextKey<boolean>;

	// private feedbackMode = false;
	// private chevronDownIcon: Heroicon;
	private showDescription = false;

	private reviewButtonsElement: HTMLElement; // Accept/reject changes
	private planButtonsElement: HTMLElement; // Delete step/start changes implementation
	private loadingButtonsElement: HTMLElement; // Stop plan generation or edits application
	private loadingButton: Button;

	//private enterFeedbackButton: Button;
	//private cancelFeedbackButton: Button;
	//private submitFeedbackButton: Button;
	//private feedbackEditorElement: HTMLElement;
	//private feedbackEditor: CodeEditorWidget;

	static readonly INPUT_SCHEME = 'planStepFeedbackInput';
	readonly inputUri: URI;


	constructor(
		readonly step: IChatPlanStep,
		readonly descriptionPart: IChatContentPart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		//@IModelService private readonly modelService: IModelService,
		//@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAideAgentService private readonly chatService: IAideAgentService,
	) {
		super();
		this.inputUri = URI.parse(`${ChatPlanStepPart.INPUT_SCHEME}:${step.sessionId}-${step.index}`);

		this.inChatPlanStep = CONTEXT_IN_CHAT_PLAN_STEP.bindTo(contextKeyService);

		this.domNode = $('.plan-step');
		this.domNode.tabIndex = -1;

		const onDidFocusStep = () => {
			this._onDidFocus.fire(this.step.index);
			this.inChatPlanStep.set(true);
		};

		const onDidBlurStep = () => {
			this.inChatPlanStep.set(false);
		};

		this.domNode.addEventListener('focus', onDidFocusStep);
		this._register(toDisposable(() => this.domNode.removeEventListener('focus', onDidFocusStep)));

		this.domNode.addEventListener('blur', onDidBlurStep);
		this._register(toDisposable(() => this.domNode.removeEventListener('blur', onDidBlurStep)));

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

		const planStepTitle = $('span.plan-step-title');
		summaryButton.element.appendChild(planStepTitle);
		planStepTitle.textContent = step.title;
		// this.chevronDownIcon = this._register(this.instantiationService.createInstance(Heroicon, summaryButton.element, 'micro/chevron-down'));
		// this.chevronDownIcon.svg.classList.add('plan-step-chevron');

		this._register(summaryButton.onDidClick(() => {
			this.showDescription = !this.showDescription;
			this.rerender();
		}));

		this.planButtonsElement = $('.plan-step-plan-buttons');
		headerElement.appendChild(this.planButtonsElement);

		const implementButton = this._register(this.instantiationService.createInstance(Button, this.planButtonsElement, { title: 'Implement changes' }));
		implementButton.element.classList.add('plan-step-implement-until');
		// this._register(this.instantiationService.createInstance(Heroicon, implementButton.element, 'micro/bolt'));

		implementButton.onDidClick(() => {
			this._implementStep();
		});

		const appendButton = this._register(this.instantiationService.createInstance(Button, this.planButtonsElement, { title: 'Append steps' }));
		appendButton.element.classList.add('plan-step-add-step');
		//this._register(this.instantiationService.createInstance(Heroicon, appendButton.element, 'micro/plus'));

		appendButton.onDidClick(() => {
			this._appendStep();
		});

		const dropPlanStep = this._register(this.instantiationService.createInstance(Button, this.planButtonsElement, { title: 'Drop plan step' }));
		//this._register(this.instantiationService.createInstance(Heroicon, dropPlanStep.element, 'micro/trash'));
		dropPlanStep.element.classList.add('plan-step-drop-step');

		dropPlanStep.onDidClick(() => {
			this._dropStep();
		});

		this.reviewButtonsElement = $('.plan-step-review-buttons');
		headerElement.appendChild(this.reviewButtonsElement);

		const acceptChangesButton = this._register(this.instantiationService.createInstance(Button, this.reviewButtonsElement, { title: 'Accept changes' }));
		acceptChangesButton.element.classList.add('plan-step-accept-changes');
		//this._register(this.instantiationService.createInstance(Heroicon, acceptChangesButton.element, 'micro/check'));

		acceptChangesButton.onDidClick(() => {
			mockEditsService.acceptEdits(step.index);
		});

		const rejectChangesButton = this._register(this.instantiationService.createInstance(Button, this.reviewButtonsElement, { title: 'Reject changes' }));
		//this._register(this.instantiationService.createInstance(Heroicon, rejectChangesButton.element, 'micro/x-mark'));
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
		//const stopIcon = this._register(this.instantiationService.createInstance(Heroicon, this.loadingButton.element, 'micro/stop'));
		//stopIcon.svg.classList.add('plan-step-stop-icon');


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

		contentElement.appendChild(this.descriptionPart.domNode);
		this.descriptionPart.domNode.classList.add('plan-step-description');

		// FEEDBACK
		/*
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
		*/

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
			//this.chevronDownIcon.svg.classList.add('plan-step-chevron-flipped');
		} else {
			dom.hide(this.descriptionPart.domNode);
			//this.chevronDownIcon.svg.classList.remove('plan-step-chevron-flipped');
		}

		this._onDidChangeHeight.fire();
		// this.layoutFeedbackEditor();
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
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

	/**
	 * Gets the codeblocks for the markdown
	 */
	public getCodeBlocksPresent(): number {
		if (this.descriptionPart instanceof ChatMarkdownContentPart) {
			return this.descriptionPart.codeblocks.length;
		} else {
			return 0;
		}
	}


	//private layoutFeedbackEditor() {
	//	const currentHeight = Math.max(this.feedbackEditor.getContentHeight(), 32);
	//	this.feedbackEditor.layout({ height: currentHeight, width: this.feedbackEditorElement.clientWidth });
	//
	//	const model = this.feedbackEditor.getModel();
	//	const inputHasText = !!model && model.getValue().trim().length > 0;
	//	this.feedbackEditorElement.classList.toggle('has-text', inputHasText);
	//}
	//
	//private enterFeedbackMode() {
	//	this.feedbackMode = true;
	//	dom.show(this.cancelFeedbackButton.element, this.submitFeedbackButton.element);
	//	dom.hide(this.enterFeedbackButton.element);
	//	this.feedbackEditor.focus();
	//}
	//
	//private exitFeedbackMode() {
	//	this.feedbackMode = false;
	//	dom.show(this.enterFeedbackButton.element);
	//	dom.hide(this.submitFeedbackButton.element, this.cancelFeedbackButton.element);
	//}

	private _dropStep() {
		this.chatService.sendRequest(this.step.sessionId, `@drop ${this.step.index} ${this.step.exchangeId}`, {
			agentMode: AgentMode.Plan,
		});
	}

	dropStep() {
		this._dropStep();
	}

	private _implementStep() {
		this.chatService.sendRequest(this.step.sessionId, `@execute ${this.step.index}`, {
			agentMode: AgentMode.Plan,
		});
	}

	implementStep() {
		this._implementStep();
	}

	private _appendStep() {
		this.chatService.sendRequest(this.step.sessionId, `@append`, {
			agentMode: AgentMode.Plan,
		});
	}

	appendStep() {
		this._appendStep();
	}


	expandStep() {
		this.showDescription = !this.showDescription;
		this.rerender();
	}

	domFocus() {
		this.domNode.focus();
	}

	domBlur() {
		this.domNode.blur();
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		return other.kind === 'planStep' && other.description === this.step.description && other.descriptionDelta === this.step.descriptionDelta;
	}
}

const mockPlanService = {
	stopGeneratingStep(index: number) {
		console.log('stopGeneratingStep', index);
	},
	feedbackForPlanStep(index: number, feedback?: string) {
		console.log('feedbackForPlanStep', index, feedback || 'No feedback');
	},
};

const mockEditsService = {
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
