/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/csChat/browser/actions/csChatActions';
import { ICSHoverChatService } from 'vs/workbench/contrib/csChat/browser/csChat';

/**
 * Returns a provider specific action that will toggle the hover chat for that provider.
 * This is used to include the provider label in the action title so it shows up in
 * the command palette.
 * @param id The id of the provider
 * @param label The label of the provider
 * @returns An action that will toggle the hover chat for this provider
 */
export function getHoverActionsForProvider(id: string, label: string) {
	return [
		class ToggleHoverChatAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.csToggleHoverChat.${id}`,
					category: CHAT_CATEGORY,
					title: { value: localize('interactiveHoverSession.toggle', "Toggle Hover Chat ({0})", label), original: `Toggle Hover Chat (${label})` },
					f1: true
				});
			}

			override run(accessor: ServicesAccessor, query?: string): void {
				const hoverChatService = accessor.get(ICSHoverChatService);
				hoverChatService.toggle();
			}
		},
		class FocusHoverChatAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.csFocusHoverChat.${id}`,
					category: CHAT_CATEGORY,
					title: { value: localize('interactiveHoverSession.focus', "Focus Hover Chat ({0})", label), original: `Focus Hover Chat (${label})` },
					keybinding: {
						weight: KeybindingWeight.EditorContrib,
						primary: KeyChord(KeyMod.Shift, KeyMod.Shift),
					},
					f1: true
				});
			}

			override run(accessor: ServicesAccessor, query?: string): void {
				const hoverChatService = accessor.get(ICSHoverChatService);
				hoverChatService.open();
			}
		}
	];
}
