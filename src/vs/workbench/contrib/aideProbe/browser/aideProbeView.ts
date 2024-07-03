/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/aideProbe';
import 'vs/css!./media/aideProbeExplanationWidget';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { CONTEXT_PROBE_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideChatBreakdowns } from 'vs/workbench/contrib/aideProbe/browser/aideProbeBreakdowns';
import { AideProbeInputPart } from 'vs/workbench/contrib/aideProbe/browser/aideProbeInputPart';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { Event } from 'vs/base/common/event';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Codicon } from 'vs/base/common/codicons';
import { defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { AideProbeViewModel, IAideProbeBreakdownViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IDimension } from 'vs/editor/common/core/dimension';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { AideMinimap } from 'vs/workbench/contrib/aideProbe/browser/aideMinimap';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

const $ = dom.$;

export class AideProbeViewPane extends ViewPane {
	private container!: HTMLElement;
	private resultWrapper!: HTMLElement;
	private explorationDetail!: HTMLElement;
	private breakdownsListContainer!: HTMLElement;
	private responseWrapper!: HTMLElement;
	private scrollableElement!: DomScrollableElement;
	private tailingToggle: Toggle | undefined;
	private dimensions: IDimension | undefined;

	private minimapContainer!: HTMLElement;
	private _mmEditor: ICodeEditor | undefined;

	private inputPart!: AideProbeInputPart;

	private readonly markdownRenderer: MarkdownRenderer;
	private requestInProgress: IContextKey<boolean>;
	private _breakdownsList: AideChatBreakdowns;
	private readonly _resourceLabels: ResourceLabels;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideProbeViewModel | undefined;
	private set viewModel(viewModel: AideProbeViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		} else {
			this.viewModel?.dispose();
			this.viewModelDisposables.clear();
		}
	}

	get viewModel(): AideProbeViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IAideProbeService private readonly aideProbeService: IAideProbeService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		this.requestInProgress = CONTEXT_PROBE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);

		this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
		this._breakdownsList = this._register(this.instantiationService.createInstance(AideChatBreakdowns, this._resourceLabels));
		this.markdownRenderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

		this.inputPart = this._register(this.instantiationService.createInstance(AideProbeInputPart));
		this.inputPart.render(this.container, this);

		this.resultWrapper = $('.resultWrapper', { tabIndex: 0 });
		this.scrollableElement = this._register(new DomScrollableElement(
			this.resultWrapper,
			{
				alwaysConsumeMouseWheel: true,
				horizontal: ScrollbarVisibility.Hidden,
				vertical: ScrollbarVisibility.Visible
			}
		));
		const scrollableElementNode = this.scrollableElement.getDomNode();
		dom.append(this.container, scrollableElementNode);

		const breakdownsWrapper = dom.append(this.resultWrapper, $('.breakdownsWrapper'));
		this.explorationDetail = dom.append(breakdownsWrapper, $('div.exploration-detail'));
		dom.append(breakdownsWrapper, $('span.chat-animated-ellipsis'));
		const text = $('span', undefined, 'Exploring the codebase');
		this.explorationDetail.appendChild(text);
		const hoverDelegate = this._register(createInstantHoverDelegate());
		const toggle = this.tailingToggle = this._register(new Toggle({
			...defaultToggleStyles,
			icon: Codicon.eyeClosed,
			title: nls.localize('followAlong', "Follow Along"),
			isChecked: false,
			hoverDelegate,
		}));
		toggle.domNode.style.display = 'none';
		this._register(toggle.onChange(() => {
			this.toggleTailing(toggle.checked);
		}));
		this.explorationDetail.appendChild(toggle.domNode);
		this.breakdownsListContainer = dom.append(breakdownsWrapper, $('.breakdownsListContainer'));
		this.responseWrapper = dom.append(this.resultWrapper, $('.responseWrapper'));

		this.minimapContainer = dom.append(this.container, $('.aideminimap'));
		let mmOptions: IEditorConstructionOptions = getSimpleEditorOptions(this.configurationService);
		const editorOptions = getSimpleCodeEditorWidgetOptions();

		mmOptions = {
			...mmOptions,
			minimap: {
				enabled: true
			}
		};

		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		this._mmEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this.minimapContainer, mmOptions, editorOptions));
		const value = `const a = 5;
		const b = 10;
		`;
		this._mmEditor.setValue(value);
		const aideMinimap = this.instantiationService.createInstance(AideMinimap, this._mmEditor);
		console.log(aideMinimap);

		this.onDidChangeItems();
	}

	private toggleTailing(tailing: boolean, silent?: boolean) {
		if (!this.tailingToggle) {
			return;
		}

		this.tailingToggle.setIcon(tailing ? Codicon.eye : Codicon.eyeClosed);
		this.tailingToggle.setTitle(tailing ? nls.localize('stopFollowing', "Stop Following") : nls.localize('followAlong', "Follow Along"));
		if (silent) {
			this.tailingToggle.checked = tailing;
			return;
		}

		this.aideProbeService.followAlong(tailing);
	}

	override focus(): void {
		super.focus();
	}

	getInputEditor(): CodeEditorWidget {
		return this.inputPart.inputEditor;
	}

	getInput(): string {
		return this.inputPart.inputEditor.getValue();
	}

	acceptInput() {
		this._acceptInput();
	}

	private _acceptInput() {
		if (this.viewModel?.requestInProgress) {
			return;
		} else if (this.viewModel) {
			this.clear();
		}

		const model = this.aideProbeService.startSession();
		this.viewModel = this.instantiationService.createInstance(AideProbeViewModel, model);
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(() => {
			this.onDidChangeItems();
		}));
		this.viewModelDisposables.add(this.viewModel.onChangeActiveBreakdown((breakdown) => {
			this.aideProbeService.navigateBreakdown();
			this._breakdownsList.openBreakdownReference(breakdown);
		}));

		const editorValue = this.getInput();
		const result = this.aideProbeService.initiateProbe(this.viewModel.model, editorValue);

		if (result) {
			this.inputPart.acceptInput(editorValue);
			this.onDidChangeItems();
			return result.responseCreatedPromise;
		}

		return undefined;
	}

	private onDidChangeItems(): void {
		if (this.viewModel?.requestInProgress) {
			this.requestInProgress.set(true);
			if (this.tailingToggle) {
				this.tailingToggle.domNode.style.display = 'block';
			}
		} else {
			this.requestInProgress.set(false);
			if (this.tailingToggle) {
				this.tailingToggle.domNode.style.display = 'none';
			}
			this.toggleTailing(false, true);
		}

		this.updateExplorationDetail();
		if ((this.viewModel?.model.response?.breakdowns.length) ?? 0 > 0) {
			this.renderBreakdownsListData(this.viewModel?.breakdowns ?? [], this.breakdownsListContainer);
			dom.show(this.breakdownsListContainer);
		} else {
			this._breakdownsList.hide();
			dom.hide(this.breakdownsListContainer);
		}
		this.renderFinalAnswer();

		if (this.dimensions) {
			this.layoutBody(this.dimensions.height, this.dimensions.width);
		}
	}

	private updateExplorationDetail(): void {
		if (this.viewModel?.sessionId) {
			this.explorationDetail.style.display = 'flex';
			const firstChild = this.explorationDetail.firstChild;
			if (firstChild) {
				if (this.requestInProgress.get()) {
					firstChild.textContent = 'Exploring the codebase';
				} else {
					firstChild.textContent = 'Exploration complete';
				}
			}
		} else {
			this.explorationDetail.style.display = 'none';
		}
	}

	private renderBreakdownsListData(breakdowns: ReadonlyArray<IAideProbeBreakdownViewModel>, container: HTMLElement) {
		this._breakdownsList.show(container);
		this._breakdownsList.updateBreakdowns(breakdowns);
	}

	private renderFinalAnswer(): void {
		dom.clearNode(this.responseWrapper);
		if (this.viewModel?.model.response?.result) {
			const result = this.viewModel.model.response.result;
			this.responseWrapper.appendChild(this.markdownRenderer.render(result).element);
		}
	}

	cancelRequest(): void {
		if (this.viewModel?.sessionId) {
			this.aideProbeService.cancelCurrentRequestForSession(this.viewModel.sessionId);
		}
	}

	clear(): void {
		this.aideProbeService.clearSession();
		this.viewModel?.dispose();
		this.viewModel = undefined;
		this.requestInProgress.set(false);
		this._breakdownsList.hide();
		this.onDidChangeItems();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.dimensions = { width, height };

		this.inputPart.layout(height, width);
		this._breakdownsList.layout(width);
		this.scrollableElement.scanDomNode();
		this.resultWrapper.style.height = `${height - this.inputPart.element.offsetHeight}px`;
	}

	override dispose(): void {
		super.dispose();
	}
}
