/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/aideProbe';
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
import { AideProbeInputPart } from 'vs/workbench/contrib/aideProbe/browser/aideProbeInputPart';
import { IAideProbeService } from 'vs/workbench/contrib/aideProbe/common/aideProbeService';
import { AideProbeModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeModel';
import { AideProbeViewModel, IAideProbeViewModel } from 'vs/workbench/contrib/aideProbe/common/aideProbeViewModel';

const $ = dom.$;

export class AideProbeViewPane extends ViewPane {
	private container!: HTMLElement;

	private inputPart!: AideProbeInputPart;

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
		}
	}

	get viewModel(): IAideProbeViewModel | undefined {
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
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = dom.append(container, $('.aide-probe-view'));

		this.inputPart = this._register(this.instantiationService.createInstance(AideProbeInputPart));
		this.inputPart.render(this.container, this);

		const model = this.instantiationService.createInstance(AideProbeModel);
		this.viewModel = this.instantiationService.createInstance(AideProbeViewModel, model);
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(events => {
			if (!this.viewModel) {
				return;
			}

			console.log('probeView populated!');
			console.log(this.viewModel);
		}));
	}

	override focus(): void {
		super.focus();
	}

	getInput(): string {
		return this.inputPart.inputEditor.getValue();
	}

	async acceptInput() {
		this._acceptInput();
	}

	private async _acceptInput() {
		if (this.viewModel) {
			const editorValue = this.getInput();
			await this.aideProbeService.initiateProbe(editorValue);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.inputPart.layout(height, width);
	}

	override dispose(): void {
		super.dispose();
	}
}
