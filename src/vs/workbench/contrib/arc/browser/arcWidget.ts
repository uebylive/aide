/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IArcWidget, IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { IArcService } from 'vs/workbench/contrib/arc/common/arcService';
import { IArcViewModel } from 'vs/workbench/contrib/arc/common/arcViewModel';

const $ = dom.$;

export class ArcWidget extends Disposable implements IArcWidget {
	public static readonly CONTRIBS: { new(...args: [IArcWidget, ...any]): any }[] = [];

	private container!: HTMLElement;

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
		@IArcWidgetService arcWidgetService: IArcWidgetService,
	) {
		super();

		this._register((arcWidgetService as ArcWidgetService).register(this));
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.arc-widget'));
		this.container.innerText = 'Hello Arc!';
		this.updateModel();
	}

	private updateModel(): void {
		this.arcService.startSession(this.providerId, CancellationToken.None);
	}
}

export class ArcWidgetService implements IArcWidgetService {
	declare readonly _serviceBrand: undefined;

	private _widgets: ArcWidget[] = [];
	private _lastFocusedWidget: ArcWidget | undefined = undefined;

	get lastFocusedWidget(): ArcWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor() { }

	register(newWidget: ArcWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);

		return combinedDisposable(
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(newWidget), 1))
		);
	}
}
