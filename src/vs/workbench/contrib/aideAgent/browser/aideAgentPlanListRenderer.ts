/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAideAgentPlanStepViewModel } from '../common/aideAgentPlanViewModel.js';
import { IChatRendererContent } from '../common/aideAgentViewModel.js';
import { annotateSpecialMarkdownContent } from '../common/annotations.js';
import { ChatMarkdownRenderer } from './aideAgentMarkdownRenderer.js';
import { IAideAgentPlanContentPart, IAideAgentPlanContentPartRenderContext } from './aideAgentPlanContentParts/aideAgentPlanContentParts.js';
import { AideAgentPlanMarkdownContentPart } from './aideAgentPlanContentParts/aideAgentPlanMarkdownContentPart.js';

const $ = dom.$;

interface IAideAgentPlanListItemTemplate {
	currentElement?: IAideAgentPlanStepViewModel;
	renderedParts?: IAideAgentPlanContentPart[];
	readonly rowContainer: HTMLElement;
	readonly value: HTMLElement;
	readonly templateDisposables: IDisposable;
	readonly elementDisposables: DisposableStore;
}

interface IItemHeightChangeParams {
	element: IAideAgentPlanStepViewModel;
	height: number;
}

export class AideAgentPlanListRenderer extends Disposable implements ITreeRenderer<IAideAgentPlanStepViewModel, FuzzyScore, IAideAgentPlanListItemTemplate> {
	static readonly ID = 'aideAgentPlanListItem';

	private readonly renderer: MarkdownRenderer;

	protected readonly _onDidChangeItemHeight = this._register(new Emitter<IItemHeightChangeParams>());
	readonly onDidChangeItemHeight: Event<IItemHeightChangeParams> = this._onDidChangeItemHeight.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.renderer = this._register(this.instantiationService.createInstance(ChatMarkdownRenderer, undefined));
	}

	get templateId(): string {
		return AideAgentPlanListRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IAideAgentPlanListItemTemplate {
		const templateDisposables = new DisposableStore();
		const rowContainer = dom.append(container, $('.aideagent-plan-item-container'));

		const value = dom.append(rowContainer, $('.value'));
		const elementDisposables = new DisposableStore();

		return { elementDisposables, rowContainer, templateDisposables, value };
	}

	renderElement(node: ITreeNode<IAideAgentPlanStepViewModel, FuzzyScore>, index: number, templateData: IAideAgentPlanListItemTemplate, height: number | undefined): void {
		const element = node.element;

		if (!element.isComplete) {
			this.doNextProgressiveRender(element, templateData);
		} else {
			this.basicRenderElement(element, index, templateData);
		}
	}

	private basicRenderElement(element: IAideAgentPlanStepViewModel, index: number, templateData: IAideAgentPlanListItemTemplate): boolean {
		const value: IChatRendererContent[] = [];
		value.push(...annotateSpecialMarkdownContent(element.value));

		dom.clearNode(templateData.value);

		const parts: IAideAgentPlanContentPart[] = [];
		value.forEach((data, index) => {
			const context: IAideAgentPlanContentPartRenderContext = {
				element,
				index,
				content: value,
				preceedingContentParts: parts,
			};
			const newPart = this.renderPlanContentPart(data, templateData, context);
			if (newPart) {
				templateData.value.appendChild(newPart.domNode);
				parts.push(newPart);
			}
		});

		const newHeight = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = newHeight;
		const disposable = templateData.elementDisposables.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(templateData.value), () => {
			// Have to recompute the height here because codeblock rendering is currently async and it may have changed.
			// If it becomes properly sync, then this could be removed.
			element.currentRenderedHeight = templateData.rowContainer.offsetHeight;
			disposable.dispose();
			this._onDidChangeItemHeight.fire({ element, height: element.currentRenderedHeight });
		}));

		return true;
	}

	private doNextProgressiveRender(element: IAideAgentPlanStepViewModel, templateData: IAideAgentPlanListItemTemplate): boolean {
		const contentForThisTurn = this.getNextProgressiveRenderContent(element);
		const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn, element);

		// Render all parts
		this.renderContentDiff(partsToRender, contentForThisTurn, element, templateData);

		const height = templateData.rowContainer.offsetHeight;
		element.currentRenderedHeight = height;
		this._onDidChangeItemHeight.fire({ element, height });

		return true;
	}

	private renderContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IAideAgentPlanStepViewModel, templateData: IAideAgentPlanListItemTemplate): void {
		const renderedParts = templateData.renderedParts ?? [];
		partsToRender.forEach((partToRender, index) => {
			if (!partToRender) {
				// null=no change
				return;
			}

			const alreadyRenderedPart = templateData.renderedParts?.[index];
			if (alreadyRenderedPart) {
				alreadyRenderedPart.dispose();
			}

			const preceedingContentParts = renderedParts.slice(0, index);
			const context: IAideAgentPlanContentPartRenderContext = {
				element,
				content: contentForThisTurn,
				preceedingContentParts,
				index
			};
			const newPart = this.renderPlanContentPart(partToRender, templateData, context);
			if (newPart) {
				// Maybe the part can't be rendered in this context, but this shouldn't really happen
				if (alreadyRenderedPart) {
					try {
						alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
					} catch (err) {
						this.logService.error('ChatListItemRenderer#renderChatContentDiff: error replacing part', err);
					}
				} else {
					templateData.renderedParts?.push(newPart);
				}
			} else if (alreadyRenderedPart) {
				alreadyRenderedPart.domNode.remove();
			}
		});
	}

	private getNextProgressiveRenderContent(element: IAideAgentPlanStepViewModel): IChatRendererContent[] {
		// const renderableResponse = annotateSpecialMarkdownContent(element.response.value);
		// return renderableResponse;
		return [];
	}

	private diff(renderedParts: ReadonlyArray<IAideAgentPlanContentPart>, contentToRender: ReadonlyArray<IChatRendererContent>, element: IAideAgentPlanStepViewModel): ReadonlyArray<IChatRendererContent | null> {
		const diff: (IChatRendererContent | null)[] = [];
		for (let i = 0; i < contentToRender.length; i++) {
			const content = contentToRender[i];
			const renderedPart = renderedParts[i];

			if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
				diff.push(content);
			} else {
				diff.push(null);
			}
		}

		return diff;
	}

	private renderPlanContentPart(content: IChatRendererContent, templateData: IAideAgentPlanListItemTemplate, context: IAideAgentPlanContentPartRenderContext): IAideAgentPlanContentPart | undefined {
		if (content.kind === 'markdownContent') {
			return this.renderMarkdown(content.content, templateData, context);
		}

		return undefined;
	}

	private renderMarkdown(markdown: IMarkdownString, templateData: IAideAgentPlanListItemTemplate, context: IAideAgentPlanContentPartRenderContext): IAideAgentPlanContentPart {
		const element = context.element;
		const fillInIncompleteTokens = !element.isComplete;
		return this.instantiationService.createInstance(AideAgentPlanMarkdownContentPart, markdown, context, fillInIncompleteTokens, this.renderer);
	}

	disposeElement(element: ITreeNode<IAideAgentPlanStepViewModel, FuzzyScore>, index: number, templateData: IAideAgentPlanListItemTemplate, height: number | undefined): void {
		if (templateData.renderedParts) {
			try {
				dispose(coalesce(templateData.renderedParts));
				templateData.renderedParts = undefined;
				dom.clearNode(templateData.rowContainer);
			} catch (err) {
				throw err;
			}
		}

		templateData.currentElement = undefined;
		templateData.elementDisposables.dispose();
	}

	disposeTemplate(templateData: IAideAgentPlanListItemTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

export class AideAgentPlanListDelegate implements IListVirtualDelegate<IAideAgentPlanStepViewModel> {
	private readonly defaultElementHeight = 200;

	getHeight(element: IAideAgentPlanStepViewModel): number {
		const height = ('currentRenderedHeight' in element ? element.currentRenderedHeight : undefined) ?? this.defaultElementHeight;
		return height;
	}

	getTemplateId(element: IAideAgentPlanStepViewModel): string {
		return AideAgentPlanListRenderer.ID;
	}

	hasDynamicHeight(element: IAideAgentPlanStepViewModel): boolean {
		return true;
	}
}
