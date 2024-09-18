/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { OutlineElement } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
// import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
// import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';
// import { FoldRange } from 'vs/editor/contrib/folding/browser/foldingRanges';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorPane } from '../../../../workbench/common/editor.js';
import { CONTEXT_AST_NAVIGATION_MODE, CONTEXT_CAN_AST_NAVIGATE } from '../../../../workbench/contrib/astNavigation/common/astNavigationContextKeys.js';
import { IASTNavigationService } from '../../../../workbench/contrib/astNavigation/common/astNavigationService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IOutline, IOutlineService, OutlineTarget } from '../../../../workbench/services/outline/browser/outline.js';

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

	private activeOutline: IOutline<OutlineElement> | undefined;
	private outlineRanges: IRange[] = [];
	// private foldingRanges: FoldRange[] = [];

	private readonly activeEditorDisposables = this._register(new DisposableStore());
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
		this.activeEditorDisposables.add(editor.onDidChangeCursorPosition(e => {
			this.handleCursorPosition(e.position);
		}));

		const model = editor.getModel();
		if (!model) {
			return;
		}
		this.activeEditorDisposables.add(model.onDidChangeContent(() => {
			this.recreateTree();
		}));

		const ranges: IRange[] = [];

		// Add symbol ranges
		const hasSymbolProvider = this.languageFeaturesService.documentSymbolProvider.has(model);
		if (hasSymbolProvider) {
			await this.createOutline(activeEditor);
			ranges.push(...this.outlineRanges.map(range => ({
				startLineNumber: range.startLineNumber,
				startColumn: 0,
				endLineNumber: range.endLineNumber,
				endColumn: 0
			}) satisfies IRange));
		}

		// Add folding ranges
		// await this.getFoldingRanges(editor);
		// ranges.push(...this.foldingRanges.map(foldingRange => ({
		// 	startLineNumber: foldingRange.startLineNumber,
		// 	startColumn: 0,
		// 	endLineNumber: foldingRange.endLineNumber + 1,
		// 	endColumn: 0
		// }) satisfies IRange));

		this.tree = this.constructTree(ranges);
		this.handleCursorPosition(editor.getPosition());
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

	// private async getFoldingRanges(editor: ICodeEditor): Promise<void> {
	// 	const foldingModel = await FoldingController.get(editor)?.getFoldingModel() ?? undefined;
	// 	if (!foldingModel) {
	// 		return;
	// 	}

	// 	this.activeEditorDisposables.add(foldingModel);
	// 	this.recreateFoldingRanges(foldingModel);
	// }

	// private recreateFoldingRanges(foldingModel: FoldingModel) {
	// 	const foldingRegions = foldingModel.regions;
	// 	if (!foldingRegions) {
	// 		return;
	// 	}

	// 	const foldingRanges: FoldRange[] = [];
	// 	for (let i = 0; i < foldingRegions.length; i++) {
	// 		const range = foldingRegions.toFoldRange(i);
	// 		if (range) {
	// 			foldingRanges.push(range);
	// 		}
	// 	}

	// 	this.foldingRanges = foldingRanges;
	// }

	private async createOutline(activeEditor: IEditorPane): Promise<void> {
		const outline: IOutline<OutlineElement> | undefined = this.activeOutline = await this.outlineService.createOutline(
			activeEditor, OutlineTarget.Breadcrumbs, CancellationToken.None
		);
		if (!outline) {
			return;
		}
		this.activeEditorDisposables.add(outline);
		this.recreateOutline(outline);
	}

	private recreateOutline(outline: IOutline<OutlineElement>) {
		this.outlineRanges = this.getOutlineRanges(
			Array.from(this.activeOutline?.config.treeDataSource.getChildren(outline) ?? []), []
		);
	}

	private getOutlineRanges(elements: OutlineElement[], ranges: IRange[]): IRange[] {
		for (const element of elements) {
			ranges.push(element.symbol.range);
			this.getOutlineRanges(Array.from(this.activeOutline?.config.treeDataSource.getChildren(element) ?? []), ranges);
		}
		return ranges;
	}

	private clear(): void {
		this.tree = undefined;
		this.currentNode = undefined;
		this.activeOutline?.dispose();
		this.activeOutline = undefined;
		this.outlineRanges = [];
		// this.foldingRanges = [];
		this.previewDisposable?.dispose();
		this.activeEditorDisposables.clear();
	}

	private previewNode(node: ASTNode): void {
		this.currentNode = node;
		this.previewDisposable?.dispose();
		const editor = this.editorService.activeTextEditorControl;
		if (!editor) {
			return;
		}

		editor.revealRangeInCenterIfOutsideViewport(this.currentNode.range, ScrollType.Smooth);
		const decorationsCollection = editor.createDecorationsCollection([{
			range: this.currentNode.range,
			options: {
				description: 'document-symbols-outline-range-highlight',
				className: 'rangeHighlight',
				isWholeLine: true
			}
		}]);
		this.previewDisposable = toDisposable(() => decorationsCollection.clear());

		if (isCodeEditor(editor)) {
			editor.setSelection(node.range);
		}
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

	private handleCursorPosition(position: Position | null) {
		scheduleAtNextAnimationFrame(getActiveWindow(), () => {
			if (position && this.tree && this.tree.children.length > 0) {
				const nodeAtCurrentPosition = this.findDeepestNodeContainingLine(this.tree, position.lineNumber);
				if (nodeAtCurrentPosition) {
					this.previewNode(nodeAtCurrentPosition);
					this._canASTNavigate.set(true);
				}
			}
		});
	}

	private findDeepestNodeContainingLine(node: ASTNode, lineNumber: number): ASTNode | undefined {
		if (node.range.startLineNumber <= lineNumber && lineNumber <= node.range.endLineNumber) {
			for (const child of node.children) {
				const deepestChild = this.findDeepestNodeContainingLine(child, lineNumber);
				if (deepestChild) {
					return deepestChild;
				}
			}
			return node;
		}

		return undefined;
	}
}
