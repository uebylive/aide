/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./media/aideProbe';
import 'vs/css!./media/aideProbeExplanationWidget';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IDimension } from 'vs/editor/common/core/dimension';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/aideChat/browser/aideChatMarkdownRenderer';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { IAideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { AideProbeViewModel } from 'vs/workbench/contrib/aideProbe/browser/aideProbeViewModel';

const $ = dom.$;

export class AideProbeViewPane extends ViewPane {
	private container!: HTMLElement;
	private resultWrapper!: HTMLElement;
	private responseWrapper!: HTMLElement;
	private scrollableElement!: DomScrollableElement;
	private viewModel: AideProbeViewModel | undefined;
	private dimensions: IDimension | undefined;

	private readonly markdownRenderer: MarkdownRenderer;

	private readonly viewModelDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAideCommandPaletteService aideCommandPaletteService: IAideCommandPaletteService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.markdownRenderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));

		const viewModel = aideCommandPaletteService.widget?.viewModel;
		if (viewModel) {
			this.viewModel = viewModel;

			this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(() => {
				this.onDidChangeItems();
			}));
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

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
		this.responseWrapper = dom.append(this.resultWrapper, $('.responseWrapper'));

		this.onDidChangeItems();
	}

	private onDidChangeItems(): void {

		if (this.viewModel?.status !== IAideProbeStatus.IN_PROGRESS) {
			this.responseWrapper.textContent = 'Loading...';
		} else {
			this.renderFinalAnswer();
		}

		if (this.dimensions) {
			this.layoutBody(this.dimensions.height, this.dimensions.width);
		}
	}

	private renderFinalAnswer(): void {
		dom.clearNode(this.responseWrapper);
		if (this.viewModel?.model.response?.result) {
			const result = this.viewModel.model.response.result;
			this.responseWrapper.appendChild(this.markdownRenderer.render(result).element);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.dimensions = { width, height };

		this.scrollableElement.scanDomNode();
	}
}
