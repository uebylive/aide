/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/aideProbe';
import 'vs/css!./media/probeBreakdownHover';
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
import { AideChatBreakdownViewModel, AideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { IAideProbeBreakdownContent, IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';

const $ = dom.$;

export class AideProbeViewPane extends ViewPane {
	private container!: HTMLElement;
	private breakdownsListContainer!: HTMLElement;

	private inputPart!: AideProbeInputPart;

	private requestInProgress: IContextKey<boolean>;
	private _breakdownsList!: AideChatBreakdowns;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideProbeModel | undefined;
	private set viewModel(viewModel: AideProbeModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}
	}

	get viewModel(): AideProbeModel | undefined {
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
		@IAideProbeService private readonly aideProbeService: IAideProbeService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		this.requestInProgress = CONTEXT_PROBE_REQUEST_IN_PROGRESS.bindTo(contextKeyService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

		this.inputPart = this._register(this.instantiationService.createInstance(AideProbeInputPart));
		this.inputPart.render(this.container, this);

		const breakdownsWrapper = dom.append(this.container, $('.breakdownsWrapper'));
		this.breakdownsListContainer = dom.append(breakdownsWrapper, $('.breakdownsListContainer'));

		this.viewModel = this.aideProbeService.startSession();
		this.viewModelDisposables.add(this.viewModel.onDidChange(() => {
			if (!this.viewModel) {
				return;
			}
			this.onDidChangeItems();
			this.requestInProgress.set(this.viewModel.requestInProgress);
		}));
	}

	override focus(): void {
		super.focus();
	}

	getInput(): string {
		if (this.viewModel) {
			this.requestInProgress.set(this.viewModel.requestInProgress);
		}
		return this.inputPart.inputEditor.getValue();
	}

	acceptInput() {
		this._acceptInput();
	}

	private _acceptInput() {
		if (this.viewModel) {
			const editorValue = this.getInput();
			const result = this.aideProbeService.initiateProbe(this.viewModel, editorValue);

			if (result) {
				this.inputPart.acceptInput(editorValue);
				return result.responseCreatedPromise;
			}
		}

		return undefined;
	}

	private onDidChangeItems(): void {
		if ((this.viewModel?.response?.breakdowns.length) ?? 0 > 0) {
			dom.show(this.breakdownsListContainer);
			const breakdownsList = $('.chat-breakdowns-list');
			if (this.breakdownsListContainer.firstChild) {
				this.breakdownsListContainer.replaceChild(breakdownsList, this.breakdownsListContainer.firstChild!);
			} else {
				this.breakdownsListContainer.appendChild(breakdownsList);
			}
			this._register(this.renderBreakdownsListData(this.viewModel?.response?.breakdowns ?? [], breakdownsList));
		} else {
			dom.hide(this.breakdownsListContainer);
		}
	}

	private renderBreakdownsListData(breakdowns: ReadonlyArray<IAideProbeBreakdownContent>, container: HTMLElement): IDisposable {
		const listDisposables = new DisposableStore();
		const list = this._breakdownsList = this.instantiationService.createInstance(AideChatBreakdowns);
		listDisposables.add(list);

		list.show(container);
		const listData = breakdowns.map((item) => {
			const viewItem = this.instantiationService.createInstance(AideChatBreakdownViewModel, item);
			listDisposables.add(viewItem);
			return viewItem;
		});
		list.updateBreakdowns(listData);

		return listDisposables;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.inputPart.layout(height, width);
		if (this._breakdownsList) {
			this._breakdownsList.layout(width);
		}
	}

	override dispose(): void {
		super.dispose();
	}
}
