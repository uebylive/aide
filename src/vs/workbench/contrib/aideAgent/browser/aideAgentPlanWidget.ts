/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { AideAgentPlanTreeItem } from './aideAgentPlan.js';
import { AideAgentPlanAccessibilityProvider } from './aideAgentPlanAccessibilityProvider.js';
import { AideAgentPlanListDelegate, AideAgentPlanListRenderer } from './aideAgentPlanListRenderer.js';

export class AideAgentPlanWidget extends Disposable {
	private tree!: WorkbenchObjectTree<AideAgentPlanTreeItem>;
	private renderer!: AideAgentPlanListRenderer;

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

		this.tree = this._register(<WorkbenchObjectTree<AideAgentPlanTreeItem>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'AideAgentPlan',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: AideAgentPlanTreeItem) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(AideAgentPlanAccessibilityProvider),
				setRowLineHeight: false,
			}
		));
	}
}
