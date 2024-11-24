/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAideAgentPlanStepViewModel } from '../../common/aideAgentPlanViewModel.js';
import { IChatRendererContent } from '../../common/aideAgentViewModel.js';
import { ChatMarkdownDecorationsRenderer } from '../aideAgentMarkdownDecorationsRenderer.js';
import { IAideAgentPlanContentPart, IAideAgentPlanContentPartRenderContext } from './aideAgentPlanContentParts.js';

const $ = dom.$;

export class AideAgentPlanMarkdownContentPart extends Disposable implements IAideAgentPlanContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

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
			},
			asyncRenderCallback: () => this._onDidChangeHeight.fire(),
		}));

		this._register(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(result.element));

		orderedDisposablesList.reverse().forEach(d => this._register(d));
		this.domNode = result.element;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: IAideAgentPlanStepViewModel): boolean {
		return other.kind === 'markdownContent' && other.content.value === this.markdown.value;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
