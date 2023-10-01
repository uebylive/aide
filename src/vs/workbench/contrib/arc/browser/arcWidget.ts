/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/arc';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IArcWidget, IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IArcViewModel } from 'vs/workbench/contrib/arc/common/arcViewModel';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export class ArcWidgetService extends Disposable implements IArcWidgetService {
	declare readonly _serviceBrand: undefined;

	private _widget: ArcWidget | undefined;
	private _container: HTMLElement | undefined;

	constructor(
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	private open() {
		const arcContainer = document.createElement('div');
		arcContainer.classList.add('arc-widget-container');
		this._container = arcContainer;
		this._widget = this.instantiationService.createInstance(ArcWidget, 'cs-arc');
		this._widget.render(this._container);
		this.workbenchLayoutService.container.appendChild(this._container);
	}

	private close(): void {
		this._widget?.dispose();
		this._widget = undefined;
		this._container?.remove();
		this._container = undefined;
	}

	toggle(): void {
		if (this._widget) {
			this.close();
		} else {
			this.open();
		}
	}
}

export class ArcWidget extends Disposable implements IArcWidget {
	public static readonly CONTRIBS: { new(...args: [IArcWidget, ...any]): any }[] = [];

	private _viewModel: IArcViewModel | undefined;
	private set viewModel(viewModel: IArcViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this._viewModel = viewModel;
	}

	get viewModel() {
		return this._viewModel;
	}

	constructor(
		private readonly providerId: string,
		@IArcService private readonly arcService: IArcService,
	) {
		super();
		this.updateModel();
	}

	render(parent: HTMLElement): void {
		parent.innerText = 'Arc Widget';
	}

	private updateModel(): void {
		this.arcService.startSession(this.providerId, CancellationToken.None);
	}
}
