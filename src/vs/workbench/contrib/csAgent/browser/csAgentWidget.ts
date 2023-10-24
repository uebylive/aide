/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICSAgentWidget } from 'vs/workbench/contrib/csAgent/browser/csAgent';
import { CSAgentRequestBlock } from 'vs/workbench/contrib/csAgent/browser/csAgentRequestBlock';
import { ICSAgentViewModel } from 'vs/workbench/contrib/csAgent/common/csAgentViewModel';

const $ = dom.$;

export interface IViewState {

}

export class CSAgentWidget extends Disposable implements ICSAgentWidget {
	private container!: HTMLElement;

	private inputPart!: CSAgentRequestBlock;

	private _viewModel: ICSAgentViewModel | undefined;
	get viewModel() {
		return this._viewModel;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.cs-agent-widget'));

		this.inputPart = this._register(this.instantiationService.createInstance(CSAgentRequestBlock));
		this.inputPart.render(this.container);
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 850);
		this.inputPart.layout(height, width);
	}
}
