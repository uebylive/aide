/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
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
	private previewDisposable: IDisposable | undefined;

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
		if (!this._astNavigationMode.get()) {
			return;
		}

		this._canASTNavigate.set(false);
		this.clearFoldingStructure();

		const activeEditor = this.editorService.activeEditorPane;
		if (!activeEditor) {
			return;
		}

		const control = activeEditor.getControl();
		let editor: ICodeEditor | undefined;
		if (isCodeEditor(control)) {
			editor = control;
		}
		if (!editor) {
			return;
		}

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const foldingRangeProviders = this.languageFeaturesService.foldingRangeProvider.getForLanguageId({ 'scheme': 'file', 'language': model.getLanguageId() });
		if (foldingRangeProviders.length === 0) {
			return;
		}

		const foldingRanges = await foldingRangeProviders[0].provideFoldingRanges(model, {}, CancellationToken.None) ?? [];
		this.foldingRoot = this.buildFoldingTree(foldingRanges);
		if (this.foldingRoot && this.foldingRoot.children.length > 0) {
			scheduleAtNextAnimationFrame(getActiveWindow(), () => {
				const nodeAtCurrentPosition = this.getNodeAtCurrentPosition();
				if (nodeAtCurrentPosition) {
					this.previewNode(nodeAtCurrentPosition);
					this._canASTNavigate.set(true);
				} else if (this.foldingRoot!.children.length > 0) {
					this.previewNode(this.foldingRoot!.children[0]);
					this._canASTNavigate.set(true);
				}
			});
		}
	}

	private clearFoldingStructure(): void {
		this.foldingRoot = undefined;
		this.currentNode = undefined;
		this.previewDisposable?.dispose();
		this.activeEditorDisposables.clear();
	}

	private buildFoldingTree(ranges: FoldingRange[]): FoldingNode {
		const root = new FoldingNode({ start: 0, end: Infinity, kind: undefined });
		const stack: FoldingNode[] = [root];

		for (const range of ranges.sort((a, b) => a.start - b.start)) {
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
		this.previewDisposable?.dispose();
		const editor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			const nodeRange = {
				selectionStartLineNumber: node.range.start,
				selectionStartColumn: 0,
				positionLineNumber: node.range.end,
				positionColumn: 0,
			};
			editor.setSelection(nodeRange);
		}
	}

	private getNodeAtCurrentPosition(): FoldingNode | undefined {
		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return undefined;
		}

		const position = editor.getPosition();
		if (!position) {
			return undefined;
		}

		return this.findDeepestNodeContainingLine(this.foldingRoot!, position.lineNumber);
	}

	private findDeepestNodeContainingLine(node: FoldingNode, lineNumber: number): FoldingNode | undefined {
		if (node.range.start <= lineNumber && lineNumber <= node.range.end) {
			for (const child of node.children) {
				const deeperNode = this.findDeepestNodeContainingLine(child, lineNumber);
				if (deeperNode) {
					return deeperNode;
				}
			}
			return node;
		}
		return undefined;
	}

	toggleASTNavigationMode(): void {
		const isAstNavigationMode = !this._astNavigationMode.get();
		this._astNavigationMode.set(isAstNavigationMode);
		if (isAstNavigationMode) {
			getActiveWindow().document.body.classList.add('astNavigationMode');
			this.updateFoldingStructure();
		} else {
			getActiveWindow().document.body.classList.remove('astNavigationMode');
			this.clearFoldingStructure();
			const editor = this.editorService.activeTextEditorControl;
			if (isCodeEditor(editor)) {
				const selection = editor.getSelection();
				if (selection) {
					const startPosition = selection.getStartPosition();
					editor.setSelection({
						startLineNumber: startPosition.lineNumber,
						startColumn: startPosition.column,
						endLineNumber: startPosition.lineNumber,
						endColumn: startPosition.column
					});
				}
			}
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
