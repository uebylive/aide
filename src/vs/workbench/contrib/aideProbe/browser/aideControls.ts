/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { SashState } from 'vs/base/browser/ui/sash/sash';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideControlsPart } from 'vs/workbench/browser/parts/aidecontrols/aidecontrolsPart';
import { AideControlsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideControlsPanel';
import { AideEditsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideEditsPanel';
import { IAideControlsService } from 'vs/workbench/services/aideControls/browser/aideControlsService';



export class AideControls extends Disposable {

	static readonly ID = 'workbench.contrib.aideControls';

	private part: AideControlsPart;
	private panel: AideControlsPanel | undefined;
	private panelHeight = 400;
	//private inputHeight = 50;

	constructor(
		@IAideControlsService aideControlsService: IAideControlsService,
		@IInstantiationService instantiationService: IInstantiationService) {


		super();

		// @willisTODO: Make sure we get the right part in the auxilliary editor, not just the main one
		this.part = aideControlsService.mainPart;

		const element = $('.aide-controls');
		this.panel = instantiationService.createInstance(AideEditsPanel, element);
		this.part.element.appendChild(element);

		this.layout();

		this._register(this.panel.onDidResize((newPanelHeight) => {
			this.panelHeight = newPanelHeight;
			this.layout();
		}));
	}

	createInput() {
		const element = $('.aide-controls-input');
	}

	layout() {
		this.part.layout(this.part.availableWidth, this.panelHeight);
		if (this.panel) {
			if (this.part.height <= this.part.minimumHeight) {
				this.panel.sash.state = SashState.AtMaximum;
				return;
			}
			this.panel.sash.state = SashState.Enabled;
			this.panel.layout(this.part.height);
		}
	}
}
