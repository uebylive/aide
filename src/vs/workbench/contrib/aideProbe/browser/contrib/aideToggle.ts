/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_PALETTE_IS_VISIBLE } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';

export class AideToggle extends Disposable {
	public static readonly ID = 'workbench.contrib.aideToggle';

	private toggleButton: Button | undefined;
	private readonly isPaletteVisible: IContextKey<boolean>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAideCommandPaletteService private readonly aideCommandPaletteService: IAideCommandPaletteService,
	) {

		super();
		this.isPaletteVisible = CONTEXT_PALETTE_IS_VISIBLE.bindTo(this.contextKeyService);

		this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_PALETTE_IS_VISIBLE.key])) && this.toggleButton) {
				if (this.isPaletteVisible.get()) {
					dom.hide(this.toggleButton.element);
				} else {
					dom.show(this.toggleButton.element);
				}
			}
		});

		this.editorService.onDidActiveEditorChange(() => {
			if (this.isPaletteVisible.get()) {
				return;
			}

			if (this.toggleButton) {
				this.toggleButton.dispose();
			}

			const editor = this.editorService.activeTextEditorControl;
			if (isCodeEditor(editor)) {
				const editorRoot = editor.getDomNode();
				if (!editorRoot) {
					return;
				}
				this.toggleButton = this._register(new Button(editorRoot, {}));
				this.toggleButton.element.classList.add('aide-toggle-button');
				this.toggleButton.setTitle('Kick off a task with AI');
				this._register(this.toggleButton.onDidClick(() => {
					this.aideCommandPaletteService.showPalette();
				}));
			}
		});
	}
}

registerWorkbenchContribution2(AideToggle.ID, AideToggle, WorkbenchPhase.Eventually);
