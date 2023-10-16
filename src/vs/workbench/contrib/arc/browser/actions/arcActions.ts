/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Icon } from 'vs/platform/action/common/action';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IArcWidgetService } from 'vs/workbench/contrib/arc/browser/arc';
import { ARC_PROVIDER_EXISTS, ARC_VIEW_VISIBLE } from 'vs/workbench/contrib/arc/common/arcContextKeys';

export const ARC_CATEGORY = { value: localize('arc.category', "Arc"), original: 'Arc' };
const showArcIcon: Icon = {
	dark: URI.parse(require.toUrl('../media/aide-white.svg')),
	light: URI.parse(require.toUrl('../media/aide-white.svg'))
};
const showCodeIcon = registerIcon('show-code', Codicon.fileCode, localize('showCode', "Activate code mode instead of Aide"));

/**
 * Returns a provider specific action that will toggle the arc for that provider.
 * This is used to include the provider label in the action title so it shows up in
 * the command palette.
 * @param id The id of the provider
 * @param label The label of the provider
 * @returns An action that will toggle the arc for this provider
 */
export function getArcActionsForProvider(id: string, label: string) {
	return [
		class ShowArcAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.showArc.${id}`,
					category: ARC_CATEGORY,
					title: { value: localize('arcSession.show', "Show Aide"), original: `Show Aide` },
					f1: true,
					icon: showArcIcon,
					precondition: ContextKeyExpr.and(ARC_PROVIDER_EXISTS, ARC_VIEW_VISIBLE.toNegated()),
					menu: [
						{
							id: MenuId.LayoutControlMenu,
							group: 'z_end',
							when: ARC_VIEW_VISIBLE.toNegated(),
						}
					]
				});
			}

			override run(accessor: ServicesAccessor, query?: string): void {
				const arcWidgetService = accessor.get(IArcWidgetService);
				arcWidgetService.show();
			}
		},

		class ShowCodeAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.showCode.${id}`,
					category: ARC_CATEGORY,
					title: { value: localize('arcSession.hide', "Show code"), original: `Show code` },
					f1: true,
					icon: showCodeIcon,
					precondition: ContextKeyExpr.and(ARC_PROVIDER_EXISTS, ARC_VIEW_VISIBLE),
					menu: [
						{
							id: MenuId.LayoutControlMenu,
							group: 'z_end',
							when: ARC_VIEW_VISIBLE,
						}
					],
					keybinding: {
						weight: KeybindingWeight.EditorContrib,
						primary: KeyMod.CtrlCmd | KeyCode.KeyW,
						win: { primary: KeyMod.CtrlCmd | KeyCode.KeyW, secondary: [KeyMod.CtrlCmd | KeyCode.F4] },
						when: ARC_VIEW_VISIBLE
					},
				});
			}

			override run(accessor: ServicesAccessor, query?: string): void {
				const arcWidgetService = accessor.get(IArcWidgetService);
				arcWidgetService.hide();
			}
		},

		class ToggleArcAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.toggleArc.${id}`,
					category: ARC_CATEGORY,
					title: { value: localize('arcSession.toggle', "Toggle Aide"), original: `Toggle Aide` },
					f1: true,
				});
			}

			override run(accessor: ServicesAccessor, query?: string): void {
				const arcWidgetService = accessor.get(IArcWidgetService);
				arcWidgetService.toggle();
			}
		},
	];
}
