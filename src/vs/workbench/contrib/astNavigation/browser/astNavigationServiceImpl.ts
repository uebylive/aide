/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorPane } from 'vs/workbench/common/editor';
import { CONTEXT_AST_NAVIGATION_MODE } from 'vs/workbench/contrib/astNavigation/common/astNavigationContextKeys';
import { IASTNavigationService } from 'vs/workbench/contrib/astNavigation/common/astNavigationService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOutline, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

class TreeNode<T> {
	element: T;
	children: TreeNode<T>[] = [];
	parent: TreeNode<T> | null = null;

	constructor(element: T) {
		this.element = element;
	}

	addChild(child: TreeNode<T>) {
		child.parent = this;
		this.children.push(child);
	}
}

export class ASTNavigationService extends Disposable implements IASTNavigationService {
	declare _serviceBrand: undefined;

	private readonly activeEditorDisposables = this._register(new DisposableStore());
	private activeOutline: IOutline<any> | undefined;
	private outlineRoot: TreeNode<any> | undefined;
	private currentNode: TreeNode<any> | undefined;
	private previewDisposable: IDisposable | undefined;

	private _astNavigationMode: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IOutlineService private readonly outlineService: IOutlineService
	) {
		super();
		this._astNavigationMode = CONTEXT_AST_NAVIGATION_MODE.bindTo(this.contextKeyService);

		this._register(this.languageFeaturesService.documentSymbolProvider.onDidChange(() => this.recreateOutline()));
		this._register(this.editorService.onDidActiveEditorChange(() => this.recreateOutline()));
	}

	private recreateOutline(): void {
		this.clearActiveOutline();
		const activeEditor = this.editorService.activeEditorPane;
		if (!activeEditor) {
			return;
		}

		this.renderActiveEditorOutline(activeEditor);
	}

	private clearActiveOutline(): void {
		this.outlineRoot = undefined;
		this.currentNode = undefined;
		this.activeEditorDisposables.clear();
	}

	toggleASTNavigationMode(): void {
		this._astNavigationMode.set(!this._astNavigationMode.get());
	}

	moveUp(): void {
		if (!this.currentNode || !this.currentNode.parent) {
			return;
		}

		const parentNode = this.currentNode.parent;
		const currentIndex = parentNode.children.indexOf(this.currentNode);

		if (currentIndex > 0) {
			this.previewDisposable?.dispose();
			this.currentNode = parentNode.children[currentIndex - 1];
			this.previewDisposable = this.activeOutline?.preview(this.currentNode.element);
		} else if (parentNode.parent) {
			const grandParentNode = parentNode.parent;
			const parentIndex = grandParentNode.children.indexOf(parentNode);

			if (parentIndex > 0) {
				const previousSiblingNode = grandParentNode.children[parentIndex - 1];
				this.previewDisposable?.dispose();
				this.currentNode = previousSiblingNode;
				this.previewDisposable = this.activeOutline?.preview(this.currentNode.element);
			} else {
				this.previewDisposable?.dispose();
				this.currentNode = parentNode;
				this.previewDisposable = this.activeOutline?.preview(parentNode.element);
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
			this.previewDisposable?.dispose();
			this.currentNode = parentNode.children[currentIndex + 1];
			this.previewDisposable = this.activeOutline?.preview(this.currentNode.element);
		} else if (parentNode.parent) {
			const grandParentNode = parentNode.parent;
			const parentIndex = grandParentNode.children.indexOf(parentNode);

			if (parentIndex < grandParentNode.children.length - 1) {
				const nextSiblingNode = grandParentNode.children[parentIndex + 1];
				this.previewDisposable?.dispose();
				this.currentNode = nextSiblingNode;
				this.previewDisposable = this.activeOutline?.preview(this.currentNode.element);
			} else {
				this.previewDisposable?.dispose();
				this.currentNode = parentNode;
				this.previewDisposable = this.activeOutline?.preview(parentNode.element);
			}
		}
	}

	moveInto(): void {
		if (this.currentNode && this.currentNode.children.length > 0) {
			this.previewDisposable?.dispose();
			this.currentNode = this.currentNode.children[0];
			this.previewDisposable = this.activeOutline?.preview(this.currentNode.element);
		}
	}

	moveOut(): void {
		if (this.currentNode && this.currentNode.parent?.element) {
			this.previewDisposable?.dispose();
			const parentNode = this.currentNode.parent;
			this.currentNode = parentNode;
			this.previewDisposable = this.activeOutline?.preview(parentNode.element);
		}
	}

	private async renderActiveEditorOutline(pane: IEditorPane): Promise<void> {
		const control = pane.getControl();
		let editor: ICodeEditor | undefined;
		if (isCodeEditor(control)) {
			editor = control;
		}
		if (!editor) {
			return;
		}
		const buffer = editor.getModel();
		if (!buffer) {
			return;
		}
		if (!this.languageFeaturesService.documentSymbolProvider.has(buffer)) {
			return;
		}

		const cts = new CancellationTokenSource();
		const timeoutTimer = new TimeoutTimer();

		this.activeEditorDisposables.add(timeoutTimer);
		this.activeEditorDisposables.add(toDisposable(() => cts.dispose(true)));

		const outline = this.activeOutline = await this.outlineService.createOutline(pane, OutlineTarget.Breadcrumbs, CancellationToken.None);
		if (!outline) {
			return;
		}
		this.activeEditorDisposables.add(outline);
		this.activeEditorDisposables.add(outline.onDidChange(e => {
			this.rebuildOutlineTree(outline);
			if (e.affectOnlyActiveElement) {
				const breadcrumbElements = this.activeOutline?.config.breadcrumbsDataSource.getBreadcrumbElements();
				if (breadcrumbElements && breadcrumbElements.length > 0) {
					this.previewDisposable?.dispose();
					const lastBreadcrumbElement = breadcrumbElements[breadcrumbElements.length - 1];
					const lastBreadcrumbNode = this.findNodeByElement(this.outlineRoot!, lastBreadcrumbElement);
					if (!lastBreadcrumbNode) {
						return;
					}

					this.currentNode = lastBreadcrumbNode;
					this.previewDisposable = this.activeOutline?.preview(lastBreadcrumbNode.element);
				}
			}
		}));

		this.rebuildOutlineTree(outline);
		if (this.outlineRoot) {
			this.currentNode = this.outlineRoot.children[0];
			this.previewDisposable = outline.preview(this.currentNode.element);
		}
	}

	private rebuildOutlineTree(outline: IOutline<any>): void {
		this.outlineRoot = this.buildTreeFromElements(Array.from(outline.config.treeDataSource.getChildren(outline)), new TreeNode<any>(null));
	}

	private buildTreeFromElements(elements: any[], root: TreeNode<any>): TreeNode<any> {
		for (const element of elements) {
			const node = new TreeNode(element);
			node.parent = root;
			root.addChild(node);
			const children = this.activeOutline?.config.treeDataSource.getChildren(element);
			if (children) {
				node.children = this.buildTreeFromElements(Array.from(children), node).children;
			}
		}
		return root;
	}

	private findNodeByElement(root: TreeNode<any>, element: any): TreeNode<any> | undefined {
		if (root.element?.id === element.id) {
			return root;
		}
		for (const child of root.children) {
			const found = this.findNodeByElement(child, element);
			if (found) {
				return found;
			}
		}
		return undefined;
	}
}
