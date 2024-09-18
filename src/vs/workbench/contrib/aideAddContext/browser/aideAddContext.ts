/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';

export class AddContext extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.aideAddContext';


	private readonly dispoasbles = this._register(new DisposableStore());

	private isActive: boolean = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
		console.log('hello');
	}

	private registerActiveListeners(): void {
		this.dispoasbles.add(this.editorService.onDidVisibleEditorsChange((...stuff) => {
			console.log('didVisibleEditorsChange', stuff);
		}));
	}

	private activate(): void {
		this.registerActiveListeners();
	}

	toggle(): void {
		if (this.isActive) {
			this.deactivate();
		} else {
			this.activate();
		}

		this.isActive = !this.isActive;
	}

	private deactivate(): void {
		this.dispoasbles.clear();
	}

	override dispose(): void {
		this.deactivate();
		super.dispose();
	}
}
