/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExplanationsService } from 'vs/workbench/contrib/explanations/common/explanations';

class ToggleExplanationAction extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.explanations.action.toggleExplanation',
			title: {
				value: nls.localize('toggleExplanation', "Toggle Explanation"),
				original: 'Toggle Explanation',
				mnemonicTitle: nls.localize({ key: 'miToggleExplanation', comment: ['&& denotes a mnemonic'] }, "Toggle &&Explanation"),
			},
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.1
			}
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		const currentPosition = editor.getPosition();
		if (!currentPosition) {
			return;
		}

		const uri = editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		const explanationsService = accessor.get(IExplanationsService);
		explanationsService.addExplanation(
			uri,
			{
				lineNumber: currentPosition.lineNumber,
				column: currentPosition.column
			}
		);
	}
}
