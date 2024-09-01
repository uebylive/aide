/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { FoldingRange } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_AST_NAVIGATION_MODE, CONTEXT_CAN_AST_NAVIGATE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class FoldingNode {
	constructor(
		public range: FoldingRange,
		public children: FoldingNode[] = [],
		public parent: FoldingNode | null = null
	) { }

	addChild(child: FoldingNode) {
		child.parent = this;
		this.children.push(child);
	}
}

export class ASTNavigationService extends Disposable implements IASTNavigationService {
	declare _serviceBrand: undefined;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private foldingRoot: FoldingNode | undefined;
	private currentNode: FoldingNode | undefined;

	private _astNavigationMode: IContextKey<boolean>;
	private _canASTNavigate: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService
	) {
		super();
		this._astNavigationMode = CONTEXT_AST_NAVIGATION_MODE.bindTo(this.contextKeyService);
		this._canASTNavigate = CONTEXT_CAN_AST_NAVIGATE.bindTo(this.contextKeyService);

		this._register(this.languageFeaturesService.foldingRangeProvider.onDidChange(() => this.updateFoldingStructure()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateFoldingStructure()));
	}

	private async updateFoldingStructure(): Promise<void> {
		this._canASTNavigate.set(false);
		this.clearFoldingStructure();

		const activeEditor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(activeEditor)) {
			return;
		}

		const model = activeEditor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();

		const foldingRangeProviders = this.languageFeaturesService.foldingRangeProvider.getForLanguageId({
			'scheme': 'file',
			'language': languageId,
		});
		if (foldingRangeProviders.length === 0) {
			return;
		}
		const foldingRangeProvider = foldingRangeProviders[0];
		const foldingRanges = await foldingRangeProvider.provideFoldingRanges(model, {}, CancellationToken.None);
		if (!foldingRanges) {
			return;
		}

		this.foldingRoot = this.buildFoldingTree(foldingRanges);
		if (this.foldingRoot && this.foldingRoot.children.length > 0) {
			this.previewNode(this.foldingRoot.children[0]);
			this._canASTNavigate.set(true);
		}
	}

	private clearFoldingStructure(): void {
		this.foldingRoot = undefined;
		this.currentNode = undefined;
		this.activeEditorDisposables.clear();
	}

	private buildFoldingTree(ranges: FoldingRange[]): FoldingNode {
		const root = new FoldingNode({ start: 0, end: Infinity, kind: undefined });
		const stack: FoldingNode[] = [root];

		for (const range of ranges) {
			while (stack.length > 1 && range.start > stack[stack.length - 1].range.end) {
				stack.pop();
			}

			const node = new FoldingNode(range);
			stack[stack.length - 1].addChild(node);
			stack.push(node);
		}

		return root;
	}

	private previewNode(node: FoldingNode): void {
		this.currentNode = node;
		const editor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			editor.revealLineInCenter(node.range.start);
			editor.setSelection({
				startLineNumber: node.range.start,
				startColumn: 1,
				endLineNumber: node.range.end,
				endColumn: 1
			});
		}
	}

	toggleASTNavigationMode(): void {
		const isAstNavigationMode = !this._astNavigationMode.get();
		this._astNavigationMode.set(isAstNavigationMode);
		if (isAstNavigationMode) {
			dom.getActiveWindow().document.body.classList.add('astNavigationMode');
			this.updateFoldingStructure();
		} else {
			dom.getActiveWindow().document.body.classList.remove('astNavigationMode');
			this.clearFoldingStructure();
		}
	}

	moveUp(): void {
		if (!this.currentNode || !this.currentNode.parent) {
			return;
		}

		const siblings = this.currentNode.parent.children;
		const currentIndex = siblings.indexOf(this.currentNode);

		if (currentIndex > 0) {
			this.previewNode(siblings[currentIndex - 1]);
		} else if (this.currentNode.parent.parent) {
			this.previewNode(this.currentNode.parent);
		}
	}

	moveDown(): void {
		if (!this.currentNode) {
			return;
		}

		if (this.currentNode.children.length > 0) {
			this.previewNode(this.currentNode.children[0]);
		} else if (this.currentNode.parent) {
			let current: FoldingNode | null = this.currentNode;
			while (current.parent) {
				const siblings = current.parent.children;
				const currentIndex = siblings.indexOf(current);
				if (currentIndex < siblings.length - 1) {
					this.previewNode(siblings[currentIndex + 1]);
					return;
				}
				current = current.parent;
			}
		}
	}

	moveInto(): void {
		if (this.currentNode && this.currentNode.children.length > 0) {
			this.previewNode(this.currentNode.children[0]);
		}
	}

	moveOut(): void {
		if (this.currentNode && this.currentNode.parent) {
			this.previewNode(this.currentNode.parent);
		}
	}
}
