/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IAideAgentPlanModel } from '../common/aideAgentPlanModel.js';
import { AideAgentPlanViewModel, IAideAgentPlanStepViewModel } from '../common/aideAgentPlanViewModel.js';
import { AideAgentPlanAccessibilityProvider } from './aideAgentPlanAccessibilityProvider.js';
import { AideAgentPlanListDelegate, AideAgentPlanListRenderer } from './aideAgentPlanListRenderer.js';

export class AideAgentPlanWidget extends Disposable {
	private tree!: WorkbenchObjectTree<IAideAgentPlanStepViewModel>;
	private renderer!: AideAgentPlanListRenderer;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: AideAgentPlanViewModel | undefined;
	private set viewModel(viewModel: AideAgentPlanViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
		}
	}

	get viewModel() {
		return this._viewModel;
	}

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(parent: HTMLElement): void {
		this.createList(parent);
	}

	private createList(listContainer: HTMLElement): void {
		const scopedInstantiationService = this._register(this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]))));
		const delegate = scopedInstantiationService.createInstance(AideAgentPlanListDelegate);

		this.renderer = this._register(scopedInstantiationService.createInstance(
			AideAgentPlanListRenderer,
		));

		this.tree = this._register(<WorkbenchObjectTree<IAideAgentPlanStepViewModel>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'AideAgentPlan',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: IAideAgentPlanStepViewModel) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(AideAgentPlanAccessibilityProvider),
				setRowLineHeight: false,
			}
		));
	}

	setModel(model: IAideAgentPlanModel): void {
		this.viewModel = this.instantiationService.createInstance(AideAgentPlanViewModel, model);
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(events => {
			if (!this.viewModel) {
				return;
			}

			this.onDidChangeItems();
		}));

		if (this.tree) {
			this.onDidChangeItems();
		}
	}

	private onDidChangeItems(): void {
		if (this.tree) {
			const treeItems = this.viewModel?.getItems().map((step): ITreeElement<IAideAgentPlanStepViewModel> => {
				return {
					element: step,
					collapsed: false,
					collapsible: false
				};
			});

			this.tree.setChildren(null, treeItems);
		}
	}
}
