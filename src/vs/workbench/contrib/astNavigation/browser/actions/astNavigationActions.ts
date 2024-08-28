/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CONTEXT_AST_NAVIGATION_MODE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';

const AST_NAVIGATION_CATEGORY = localize2('astNavigation', "AST Navigation");

class ToggleASTNavigationMode extends Action2 {
	static readonly ID = 'astNavigation.toggleMode';

	constructor() {
		super({
			id: ToggleASTNavigationMode.ID,
			title: localize2('toggleASTNavigationMode', "Toggle AST Navigation Mode"),
			f1: true,
			category: AST_NAVIGATION_CATEGORY,
			toggled: ContextKeyExpr.equals(CONTEXT_AST_NAVIGATION_MODE.key, true),
			icon: Codicon.preview,
			menu: {
				id: MenuId.LayoutControlMenu,
				group: 'z_end',
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.WinCtrl | KeyCode.KeyM,
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const astNavigationService = accessor.get(IASTNavigationService);
		astNavigationService.toggleASTNavigationMode();
	}
}

export function registerASTNavigationActions() {
	registerAction2(ToggleASTNavigationMode);
}
