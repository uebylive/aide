/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IAideAgentPlanModel } from '../common/aideAgentPlanModel.js';
import { AideAgentPlanViewModel, IAideAgentPlanStepViewModel } from '../common/aideAgentPlanViewModel.js';
import { AideAgentPlanAccessibilityProvider } from './aideAgentPlanAccessibilityProvider.js';
import { AideAgentPlanListDelegate, AideAgentPlanListRenderer } from './aideAgentPlanListRenderer.js';

const $ = dom.$;

export class AideAgentPlanWidget extends Disposable {
	private _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private tree!: WorkbenchObjectTree<IAideAgentPlanStepViewModel>;
	private renderer!: AideAgentPlanListRenderer;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private visibleChangeCount = 0;

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

	private _visible = false;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.interactive-session'));
		this.listContainer = dom.append(this.container, $('.interactive-list'));
		this.createList(this.listContainer);

		if (this.viewModel) {
			this.onDidChangeItems();
		}
	}

	setVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
		this.visibleChangeCount++;
		this.renderer.setVisible(visible);

		if (visible) {
			this._register(disposableTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this._visible) {
					this.onDidChangeItems();
				}
			}, 0));
		} else if (wasVisible) {
			this._onDidHide.fire();
		}
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

		this._register(this.renderer.onDidChangeItemHeight((e) => {
			this.tree.updateElementHeight(e.element, e.height);
		}));
	}

	setModel(model: IAideAgentPlanModel): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		this.viewModel = this.instantiationService.createInstance(AideAgentPlanViewModel, model);
		this.viewModelDisposables.add(Event.accumulate(this.viewModel.onDidChange, 0)(() => {
			if (!this.viewModel) {
				return;
			}

			this.onDidChangeItems();
		}));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));

		if (this.tree) {
			this.onDidChangeItems();
		}
	}

	private onDidChangeItems(): void {
		if (this.tree && this._visible) {
			const treeItems = (this.viewModel?.getItems() ?? [])
				.map((step): ITreeElement<IAideAgentPlanStepViewModel> => {
					return {
						element: step,
						collapsed: false,
						collapsible: false
					};
				});

			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return element.id + `_${this.visibleChangeCount}`;
					}
				}
			});
		}
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 600);

		this.tree.layout(height, width);
		this.tree.getHTMLElement().style.height = `${height}px`;
	}
}
