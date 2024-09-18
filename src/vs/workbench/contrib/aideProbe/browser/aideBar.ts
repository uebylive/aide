/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Heroicon } from '../../../../workbench/browser/heroicon.js';
import { AideEditsPanel } from '../../../../workbench/contrib/aideProbe/browser/aideEditsPanel.js';
import { AidePanel } from '../../../../workbench/contrib/aideProbe/browser/aidePanel.js';
import { IAideProbeExplanationService } from '../../../../workbench/contrib/aideProbe/browser/aideProbeExplanations.js';
import { IAideBarService } from '../../../../workbench/services/aideBar/browser/aideBarService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';

const $ = dom.$;

export class AideBar extends Disposable {
	static readonly ID = 'workbench.contrib.aideBar';

	private part = this.aideBarService.mainPart;
	private editorPart = this.editorGroupService.mainPart;
	// TODO(@g-danna) Replace this with proper service and event
	private editorSize = this.editorPart.getSize(0);

	private element: HTMLElement;
	private editsPanel: AideEditsPanel;
	private openPanel: AidePanel | undefined;


	constructor(
		@IAideBarService private readonly aideBarService: IAideBarService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
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
		const button = this._register(this.instantiationService.createInstance(Button, buttonContainer, { title: 'Aide Edits' }));
		button.enabled = false;
		this._register(this.instantiationService.createInstance(Heroicon, button.element, 'solid/list-bullet'));

		Object.assign(button.element.style, {
			width: '32px',
			height: '32px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		});

		this.editsPanel = this.openPanel = this.instantiationService.createInstance(AideEditsPanel, button, buttonContainer);

		button.onDidClick(() => {
			if (this.editsPanel.isVisible) {
				this.editsPanel.hide();
			} else {
				this.editsPanel.show();
			}
		});

		// TODO(@g-danna) Replace this with proper service and event
		this._register(this.editorPart.onDidLayout((editorSize) => {
			this.editorSize = editorSize;
			this.layout();
		}));

		this.layout();
	}

	private layout() {
		this.element.style.height = this.part.dimension?.height + 'px';
		if (this.openPanel) {
			this.openPanel.maxWidth = this.editorSize.width;
			this.openPanel.maxHeight = this.editorSize.height;
		}
	}
}
