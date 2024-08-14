/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AideBarService } from 'vs/workbench/browser/parts/aidebar/aidebarPart';
import { AideEditsPanel } from 'vs/workbench/contrib/aideProbe/browser/aideEditsPanel';
import { IAideProbeExplanationService } from 'vs/workbench/contrib/aideProbe/browser/aideProbeExplanations';
import { IAideBarService } from 'vs/workbench/services/aideBar/browser/aideBarService';

const $ = dom.$;

enum Panels {
	Edits = 'edits',
	None = 'none'
}

//import { AideBarPart } from 'vs/workbench/browser/parts/aidebar/aidebarPart';

export class AideBar extends Disposable {
	static readonly ID = 'workbench.contrib.aideBar';

	private part = this.aideBarService.mainPart;
	private element: HTMLElement;
	private openPanel: Panels = Panels.None;


	constructor(
		@IAideBarService private readonly aideBarService: AideBarService,
		@IAideProbeExplanationService explanationService: IAideProbeExplanationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService

	) {
		super();
		try {
			assertIsDefined(this.part.content);
		} catch (err) {
			console.error('AideBar: Could not find content element');
		}

		this.element = $('.aide-bar');
		this.part.content!.appendChild(this.element);

		const buttonContainer = $('.aide-bar-button-container');
		this.element.appendChild(buttonContainer);
		const button = $('.aide-bar-button');
		buttonContainer.appendChild(button);

		this.instantiationService.createInstance(AideEditsPanel, buttonContainer);

		this.element.addEventListener('click', e => {
			if (this.openPanel === Panels.None) {
				this.openPanel = Panels.Edits;
			} else {
				this.openPanel = Panels.None;
			}
		});


		this._register(this.part.onDidSizeChange(() => {
			this.layout();
		}));
		this.layout();
	}

	private layout() {
		this.element.style.height = this.part.dimension?.height + 'px';
	}
}
