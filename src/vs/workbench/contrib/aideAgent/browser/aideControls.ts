/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { editorBackground } from '../../../../platform/theme/common/colors/editorColors.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IBottomBarPartService } from '../../../services/bottomBarPart/browser/bottomBarPartService.js';
import { ChatAgentLocation } from '../common/aideAgentAgents.js';
import { ChatModel } from '../common/aideAgentModel.js';
import { IAideAgentService } from '../common/aideAgentService.js';
import { ChatWidget } from './aideAgentWidget.js';
import { IAideControlsService } from './aideControlsService.js';

const $ = dom.$;

export class AideControls extends Disposable {
	public static readonly ID = 'workbench.contrib.aideControls';

	private element: HTMLElement;

	private _widget: ChatWidget;
	get widget() {
		return this._widget;
	}
	private model: ChatModel | undefined;

	private part = this.bottomBarPartService.mainPart;

	constructor(
		@IBottomBarPartService private readonly bottomBarPartService: IBottomBarPartService,
		@IAideAgentService private readonly aideAgentService: IAideAgentService,
		@IAideControlsService private readonly aideControlsService: IAideControlsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.aideControlsService.registerControls(this);

		const element = this.element = $('.aide-controls');
		this.part.element.appendChild(element);

		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._register(this.contextKeyService.createScoped(element))
			])
		));
		this._widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Panel,
				{},
				{ supportsFileReferences: true },
				{
					listForeground: SIDE_BAR_FOREGROUND,
					listBackground: editorBackground,
					overlayBackground: editorBackground,
					inputEditorBackground: editorBackground,
					resultEditorBackground: editorBackground
				}
			)
		);
		this._widget.render(element);
		this._widget.setDynamicChatTreeItemLayout(0, this.part.maximumHeight);
		this.updateModel();
		this.layout();
	}

	private updateModel(): void {
		this.model ??= this.aideAgentService.startSession(ChatAgentLocation.Panel, CancellationToken.None);
		if (!this.model) {
			throw new Error('Could not start chat session');
		}

		this._widget.setModel(this.model, {});
	}

	layout(width?: number, height?: number) {
		if (width === undefined) {
			width = this.part.width ?? 0;
		}
		if (height === undefined) {
			height = this.part.height ?? 0;
		}

		if (!width || !height) {
			return;
		}

		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		this.widget.layout(height, width);
	}
}
