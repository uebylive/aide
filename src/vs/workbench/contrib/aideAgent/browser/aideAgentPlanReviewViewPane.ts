/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IDimension } from '../../../../editor/common/core/dimension.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Memento } from '../../../common/memento.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IPlanReviewViewTitleActionContext } from './actions/aideAgentPlanReviewActions.js';


interface IViewPaneState {
	sessionId?: string;
}

export const PLAN_REVIEW_PANEL_ID = 'workbench.panel.aideAgentPlanReview';

export class PlanReviewPane extends ViewPane {
	private dimension: IDimension | undefined;

	private readonly modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private readonly viewState: IViewPaneState;

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
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		// Don't know if this is needs to be per exchange id
		this.memento = new Memento('aide-agent-plan-review', this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IViewPaneState;
	}

	override getActionsContext(): IPlanReviewViewTitleActionContext {
		return {
			planReviewView: this
		};
	}


	protected override renderBody(parent: HTMLElement): void {
		console.log('renderBody');
		try {
			super.renderBody(parent);

			// const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
			// const locationBasedColors = this.getLocationBasedColors();

			this._register(this.onDidChangeBodyVisibility(visible => {
				// this._widget.setVisible(visible);
				// Update visibility of children that need to be updated after the widget is visible
			}));

		} catch (e) {
			this.logService.error(e);
			throw e;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		this.dimension = { height, width };
		super.layoutBody(height, width);
	}

	override saveState(): void {
		// if (this._widget) {
		// 	// Since input history is per-provider, this is handled by a separate service and not the memento here.
		// 	// TODO multiple chat views will overwrite each other
		// 	this._widget.saveState();
		//
		// 	this.updateViewState();
		// 	this.memento.saveMemento();
		// }

		super.saveState();
	}
}
