/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FoldRange } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorPane } from 'vs/workbench/common/editor';
import { CONTEXT_AST_NAVIGATION_MODE, CONTEXT_CAN_AST_NAVIGATE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutline, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

class ASTNode {
	constructor(
		public range: IRange,
		public children: ASTNode[] = [],
		public parent: ASTNode | null = null
	) { }

	addChild(child: ASTNode) {
		child.parent = this;
		this.children.push(child);
		this.children.sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);
	}
}

export class ASTNavigationService extends Disposable implements IASTNavigationService {
	declare _serviceBrand: undefined;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private activeOutline: IOutline<OutlineElement> | undefined;
	private tree: ASTNode | undefined;
	private currentNode: ASTNode | undefined;
	private previewDisposable: IDisposable | undefined;

	private _astNavigationMode: IContextKey<boolean>;
	private _canASTNavigate: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IOutlineService private readonly outlineService: IOutlineService
	) {
		super();
		this._astNavigationMode = CONTEXT_AST_NAVIGATION_MODE.bindTo(this.contextKeyService);
		this._canASTNavigate = CONTEXT_CAN_AST_NAVIGATE.bindTo(this.contextKeyService);

		this._register(this.languageFeaturesService.documentSymbolProvider.onDidChange(() => this.recreateTree()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.recreateTree()));
	}

	private async recreateTree(): Promise<void> {
		if (!this._astNavigationMode.get()) {
			return;
		}

		this._canASTNavigate.set(false);
		this.clear();

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

		const ranges: IRange[] = [];

		// Add symbol ranges
		const hasSymbolProvider = this.languageFeaturesService.documentSymbolProvider.has(model);
		if (hasSymbolProvider) {
			const outlineRanges = await this.getOutline(activeEditor);
			ranges.push(...outlineRanges.map(range => ({
				startLineNumber: range.startLineNumber,
				startColumn: 0,
				endLineNumber: range.endLineNumber,
				endColumn: 0
			}) satisfies IRange));
		}

		// Add folding ranges
		const foldingRanges = await this.getFoldingRanges(editor);
		ranges.push(...foldingRanges.map(foldingRange => ({
			startLineNumber: foldingRange.startLineNumber,
			startColumn: 0,
			endLineNumber: foldingRange.endLineNumber + 1,
			endColumn: 0
		}) satisfies IRange));

		this.tree = this.constructTree(ranges);
		if (this.tree && this.tree.children.length > 0) {
			scheduleAtNextAnimationFrame(getActiveWindow(), () => {
				const nodeAtCurrentPosition = this.getNodeAtCurrentPosition();
				if (nodeAtCurrentPosition) {
					this.previewNode(nodeAtCurrentPosition);
					this._canASTNavigate.set(true);
				} else if (this.tree!.children.length > 0) {
					this.previewNode(this.tree!.children[0]);
					this._canASTNavigate.set(true);
				}
			});
		}
	}

	private async getFoldingRanges(editor: ICodeEditor): Promise<FoldRange[]> {
		const foldingModel = await FoldingController.get(editor)?.getFoldingModel() ?? undefined;
		const foldingRegions = foldingModel?.regions;
		if (!foldingRegions) {
			return [];
		}

		const foldingRanges: FoldRange[] = [];
		for (let i = 0; i < foldingRegions.length; i++) {
			const range = foldingRegions.toFoldRange(i);
			if (range) {
				foldingRanges.push(range);
			}
		}

		return foldingRanges;
	}

	private clear(): void {
		this.tree = undefined;
		this.currentNode = undefined;
		this.activeOutline?.dispose();
		this.activeOutline = undefined;
		this.previewDisposable?.dispose();
		this.activeEditorDisposables.clear();
	}

	private constructTree(ranges: IRange[]): ASTNode {
		ranges.sort(Range.compareRangesUsingStarts);
		ranges = ranges.filter((range, index) => index === 0 || !Range.equalsRange(range, ranges[index - 1]));
		const root = new ASTNode({
			startLineNumber: ranges[0].startLineNumber,
			startColumn: 0,
			endLineNumber: ranges[ranges.length - 1].endLineNumber,
			endColumn: 0
		});

		const stack: ASTNode[] = [root];
		const nodeMap = new Map<string, ASTNode>();

		for (const range of ranges) {
			const rangeKey = `${range.startLineNumber}-${range.startColumn}-${range.endLineNumber}-${range.endColumn}`;
			let currentNode = nodeMap.get(rangeKey);

			if (!currentNode) {
				currentNode = new ASTNode(range);
				nodeMap.set(rangeKey, currentNode);
			}

			let parentNode: ASTNode | null = null;

			while (stack.length > 0) {
				const topNode = stack[stack.length - 1];

				if (Range.containsRange(topNode.range, range)) {
					const existingChild = topNode.children.find(child => child.range.startLineNumber === range.startLineNumber && child.range.endLineNumber === range.endLineNumber);
					if (existingChild) {
						currentNode = existingChild;
						break;
					}
					parentNode = topNode;
					break;
				} else if (range.endLineNumber < topNode.range.startLineNumber) {
					break;
				} else {
					stack.pop();
				}
			}

			if (parentNode) {
				parentNode.addChild(currentNode);
			} else {
				root.addChild(currentNode);
			}

			stack.push(currentNode);
		}

		return root;
	}

	private async getOutline(pane: IEditorPane): Promise<IRange[]> {
		const outline: IOutline<OutlineElement> | undefined = this.activeOutline = await this.outlineService.createOutline(
			pane, OutlineTarget.Breadcrumbs, CancellationToken.None
		);
		if (!outline) {
			return [];
		}

		let outlineRanges: IRange[] = [];
		outlineRanges = this.getOutlineRanges(Array.from(outline.config.treeDataSource.getChildren(outline)), outlineRanges);

		return outlineRanges;
	}

	private getOutlineRanges(elements: OutlineElement[], ranges: IRange[]): IRange[] {
		for (const element of elements) {
			ranges.push(element.symbol.range);
			this.getOutlineRanges(Array.from(this.activeOutline?.config.treeDataSource.getChildren(element) ?? []), ranges);
		}
		return ranges;
	}

	private previewNode(node: ASTNode): void {
		this.currentNode = node;
		this.previewDisposable?.dispose();
		const editor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(editor)) {
			const nodeRange = {
				selectionStartLineNumber: node.range.startLineNumber,
				selectionStartColumn: 0,
				positionLineNumber: node.range.endLineNumber,
				positionColumn: 0,
			};
			editor.setSelection(nodeRange);
		}
	}

	private getNodeAtCurrentPosition(): ASTNode | undefined {
		const editor = this.editorService.activeTextEditorControl;
		if (!isCodeEditor(editor)) {
			return undefined;
		}

		const position = editor.getPosition();
		if (!position) {
			return undefined;
		}

		return this.findDeepestNodeContainingLine(this.tree!, position.lineNumber);
	}

	private findDeepestNodeContainingLine(node: ASTNode, lineNumber: number): ASTNode | undefined {
		if (node.range.startLineNumber <= lineNumber && lineNumber <= node.range.endLineNumber) {
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
			this.recreateTree();
		} else {
			getActiveWindow().document.body.classList.remove('astNavigationMode');
			this.clear();
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

		const parentNode = this.currentNode.parent;
		const currentIndex = parentNode.children.indexOf(this.currentNode);

		if (currentIndex > 0) {
			this.previewNode(parentNode.children[currentIndex - 1]);
		} else if (parentNode.parent) {
			const grandParentNode = parentNode.parent;
			const parentIndex = grandParentNode.children.indexOf(parentNode);

			if (parentIndex > 0) {
				const previousSiblingNode = grandParentNode.children[parentIndex - 1];
				this.previewNode(previousSiblingNode);
			} else {
				this.previewNode(parentNode);
			}
		}
	}

	moveDown(): void {
		if (!this.currentNode || !this.currentNode.parent) {
			return;
		}

		const parentNode = this.currentNode.parent;
		const currentIndex = parentNode.children.indexOf(this.currentNode);

		if (currentIndex < parentNode.children.length - 1) {
			this.previewNode(parentNode.children[currentIndex + 1]);
		} else if (parentNode.parent) {
			const grandParentNode = parentNode.parent;
			const parentIndex = grandParentNode.children.indexOf(parentNode);

			if (parentIndex < grandParentNode.children.length - 1) {
				const nextSiblingNode = grandParentNode.children[parentIndex + 1];
				this.previewNode(nextSiblingNode);
			} else {
				this.previewNode(parentNode);
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
			const parentNode = this.currentNode.parent;
			this.previewNode(parentNode);
		}
	}
}
