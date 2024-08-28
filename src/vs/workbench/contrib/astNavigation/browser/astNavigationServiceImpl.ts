/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { OutlineElement2 } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { IEditorPane } from 'vs/workbench/common/editor';
import { CONTEXT_AST_NAVIGATION_MODE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutline, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

export class ASTNavigationService extends Disposable implements IASTNavigationService {
	declare _serviceBrand: undefined;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private activeOutline: IOutline<any> | undefined;
	private activeOutlineElements: OutlineElement2[] = [];
	private activeOutlineElementIndex: number = -1;
	private previewDisposable: IDisposable | undefined;

	private _astNavigationMode: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@IOutlineService private readonly outlineService: IOutlineService
	) {
		super();
		this._astNavigationMode = CONTEXT_AST_NAVIGATION_MODE.bindTo(this.contextKeyService);

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.clearActiveOutline();

			const activeEditor = this.editorService.activeEditorPane;
			if (!activeEditor) {
				return;
			}

			this.renderActiveEditorOutline(activeEditor);
		}));
	}

	private clearActiveOutline(): void {
		this.activeOutline = undefined;
		this.activeOutlineElements.length = 0;
		this.activeOutlineElementIndex = -1;
		this.activeEditorDisposables.clear();
	}

	toggleASTNavigationMode(): void {
		this._astNavigationMode.set(!this._astNavigationMode.get());
	}

	moveUp(): void {
		if (this.activeOutlineElementIndex > 0) {
			this.previewDisposable?.dispose();
			this.activeOutlineElementIndex--;
			const outlineElement = this.activeOutlineElements[this.activeOutlineElementIndex];
			this.previewDisposable = this.activeOutline?.preview(outlineElement.element);
		}
	}

	moveDown(): void {
		if (this.activeOutlineElementIndex >= 0 && this.activeOutlineElementIndex < this.activeOutlineElements.length - 1) {
			this.previewDisposable?.dispose();
			this.activeOutlineElementIndex++;
			const outlineElement = this.activeOutlineElements[this.activeOutlineElementIndex];
			this.previewDisposable = this.activeOutline?.preview(outlineElement.element);
		}
	}

	private async renderActiveEditorOutline(pane: IEditorPane): Promise<void> {
		const outline = this.activeOutline = await this.outlineService.createOutline(pane, OutlineTarget.Breadcrumbs, CancellationToken.None);
		if (!outline) {
			return;
		}

		const control = pane.getControl();
		let editor: ICodeEditor | undefined;
		if (isCodeEditor(control)) {
			editor = control;
		}
		if (!editor) {
			return undefined;
		}

		this.activeEditorDisposables.add(editor.onDidChangeCursorPosition(() => {
			// TODO: update active outline element index based on cursor position
		}));

		this.activeEditorDisposables.add(outline);
		const elements = outline.config.treeDataSource.getChildren(outline);
		for (const element of elements) {
			this.activeOutlineElements.push(new OutlineElement2(element, outline));
		}

		if (this.activeOutlineElements.length > 0) {
			this.activeOutlineElementIndex = 0;
			const firstOutline = this.activeOutlineElements[this.activeOutlineElementIndex];
			this.previewDisposable = outline.preview(firstOutline.element);
		}
	}
}
