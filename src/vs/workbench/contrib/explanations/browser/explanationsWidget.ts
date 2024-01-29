/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { memoize } from 'vs/base/common/decorators';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { ContentWidgetPositionPreference, IActiveCodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';

const $ = dom.$;

export class ExplanationsWidget implements IContentWidget, IDisposable {
	private domNode!: HTMLElement;
	private range: Range | null;
	private toDispose: IDisposable[] = [];

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly decorationId: string,
	) {
		this.range = this.editor.getModel().getDecorationRange(decorationId);
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => {
			const model = this.editor.getModel();
			const range = model.getDecorationRange(this.decorationId);
			if (this.range && !this.range.equalsRange(range)) {
				this.range = range;
				this.editor.layoutContentWidget(this);
			}
		}));
		this.create();

		this.editor.addContentWidget(this);
		this.editor.layoutContentWidget(this);
	}

	private create(): void {
		this.domNode = $('.explanations-widget');
		const message = $('.message');
		message.innerText = 'Hello world';
		this.domNode.appendChild(message);
	}

	@memoize
	getId(): string {
		return generateUuid();
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.range) {
			return null;
		}

		return {
			position: this.range.getStartPosition(),
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	dispose(): void {
		this.editor.removeContentWidget(this);
		dispose(this.toDispose);
	}
}
