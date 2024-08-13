/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICSAccountService } from 'vs/platform/codestoryAccount/common/csAccount';

export class ToggleCodestoryAccountCardAction extends Action2 {
	static readonly ID = 'workbench.action.toggleCodestoryAccountCard';
	static readonly LABEL = localize('aide', "AIDE");

	constructor() {
		super({
			id: ToggleCodestoryAccountCardAction.ID,
			title: ToggleCodestoryAccountCardAction.LABEL,
			category: Categories.View,
			menu: [{
				id: MenuId.CodestoryAccountMenu,
				group: 'navigation'
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const csAccountService = accessor.get(ICSAccountService);
		csAccountService.toggle();
	}
}

registerAction2(ToggleCodestoryAccountCardAction);
