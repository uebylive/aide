/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IAideCommandPaletteService } from 'vs/workbench/contrib/aideProbe/browser/aideCommandPaletteService';
import { CONTEXT_PALETTE_IS_VISIBLE, CONTEXT_PROBE_REQUEST_STATUS } from 'vs/workbench/contrib/aideProbe/browser/aideProbeContextKeys';
import { AideProbeStatus } from 'vs/workbench/contrib/aideProbe/browser/aideProbeModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class AideToggle extends Disposable {
	public static readonly ID = 'workbench.contrib.aideToggle';

	private toggleButton: Button | undefined;
	private readonly isPaletteVisible: IContextKey<boolean>;
	private readonly requestStatus: IContextKey<AideProbeStatus>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAideCommandPaletteService private readonly aideCommandPaletteService: IAideCommandPaletteService,
	) {

		super();
		this.isPaletteVisible = CONTEXT_PALETTE_IS_VISIBLE.bindTo(this.contextKeyService);
		this.requestStatus = CONTEXT_PROBE_REQUEST_STATUS.bindTo(this.contextKeyService);

		this.renderToggleButton();

		this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_PALETTE_IS_VISIBLE.key])) && this.toggleButton) {
				if (this.isPaletteVisible.get()) {
					dom.hide(this.toggleButton.element);
				} else {
					dom.show(this.toggleButton.element);
				}
			} else if (e.affectsSome(new Set([CONTEXT_PROBE_REQUEST_STATUS.key])) && this.toggleButton) {
				if (this.requestStatus.get() === 'INACTIVE') {
					this.toggleButton.element.classList.remove('loading');
				} else {
					this.toggleButton.element.classList.add('loading');
				}
			}
		});

		this.editorService.onDidActiveEditorChange(() => {
			this.renderToggleButton();
		});
	}

	private renderToggleButton() {
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
	}
}

registerWorkbenchContribution2(AideToggle.ID, AideToggle, WorkbenchPhase.BlockStartup);
