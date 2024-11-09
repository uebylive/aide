/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRendererContent } from '../../common/aideAgentViewModel.js';
import { ChatMarkdownDecorationsRenderer } from '../aideAgentMarkdownDecorationsRenderer.js';
import { IAideAgentPlanStepViewModel } from '../../common/aideAgentPlanViewModel.js';
import { IAideAgentPlanContentPart, IAideAgentPlanContentPartRenderContext } from './aideAgentPlanContentParts.js';

const $ = dom.$;

export class AideAgentPlanMarkdownContentPart extends Disposable implements IAideAgentPlanContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		private readonly markdown: IMarkdownString,
		context: IAideAgentPlanContentPartRenderContext,
		fillInIncompleteTokens = false,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);

		const orderedDisposablesList: IDisposable[] = [];
		const result = this._register(renderer.render(markdown, {
			fillInIncompleteTokens: true,
			codeBlockRendererSync: (languageId, text) => {
				return $('div');
			}
		}));

		this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(result.element));

		orderedDisposablesList.reverse().forEach(d => this._register(d));
		this.domNode = result.element;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: IAideAgentPlanStepViewModel): boolean {
		return other.kind === 'markdownContent' && other.content.value === this.markdown.value;
	}
}
