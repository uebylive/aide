/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
const $ = dom.$;

export class AideProbeGoToDefinitionWidget extends Disposable implements IContentWidget {
	static readonly ID = 'editor.contrib.aideProbeGoToDefinitionWidget';
	private _isVisible: boolean;
	private domNode!: HTMLElement;
	private showAtPosition: Position | null;
	private positionPreference: ContentWidgetPositionPreference[];
	getId(): string {
		return AideProbeGoToDefinitionWidget.ID;
	}
	getDomNode(): HTMLElement {
		return this.domNode;
	}
	getPosition(): IContentWidgetPosition | null {
		return this._isVisible ? {
			position: this.showAtPosition,
			preference: this.positionPreference
		} : null;
	}
	constructor(
		private readonly editor: ICodeEditor,
	) {
		super();
		this._isVisible = false;
		this.showAtPosition = null;
		this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
	}

	private create(content: HTMLElement): void {
		this.domNode = $('.aide-probe-explanation-widget.monaco-hover');
		this.domNode.appendChild(content);

		this.editor.addContentWidget(this);
	}

	async showAt(position: Position, content: HTMLElement): Promise<void> {
		if (!this.editor.hasModel()) {
			this.hide();
			return;
		}

		if (!this.domNode) {
			this.create(content);
		}

		this.showAtPosition = position;
		this._isVisible = true;
		this.editor.layoutContentWidget(this);
	}

	hide(): void {
		if (!this._isVisible) {
			return;
		}
		if (dom.isAncestorOfActiveElement(this.domNode)) {
			this.editor.focus();
		}
		this._isVisible = false;
		this.editor.layoutContentWidget(this);
		this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
	}
}
