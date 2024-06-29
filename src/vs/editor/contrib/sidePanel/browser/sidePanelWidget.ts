/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import 'vs/css!./sidePanelWidget';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';

const $ = dom.$;

/**
 * Notes:
 * - Public methods to be implemented that control the flow. These can be overridden.
 * - Anything we don't expect/need to be overridden would be private
 * - abstract methods to be created which need to be implemented by implementing classes
 * - For now, we'll assume this will always be opened on the right side
 *
 * In our case, let's try to offload the implementation of the core functionality to the workbench layer
 * So the abstract class should help with creating a widget in the right location and offer ways to open/close
 * I'm assuming we'd implement the open/close itself through buttons at the right end of the tab row (workbench)
 * As well as be managed through the probe widget.
 * Should be resizable, with a min-width.
 *
 * The API I'd like to start with is perhaps:
 * 1. Show (public)
 * 2. _fillContainer (abstract)
 */
export abstract class SidePanelWidget extends Disposable implements IOverlayWidget {
	private static readonly ID = 'editor.contrib.sidePanelWidget';

	panelId: string;
	domNode: HTMLElement;

	constructor(
		readonly editor: ICodeEditor
	) {
		super();

		this.editor = editor;
		this.domNode = $('.editor-side-panel-container');
		this.panelId = generateUuid();
	}

	protected show(): void {
		this._fillContainer(this.domNode);
		this.domNode.style.height = `${this.editor.getScrollHeight()}px`;
		this.editor.addOverlayWidget(this);
		this.editor.layoutOverlayWidget(this);
	}

	hide(): void {
		dom.clearNode(this.domNode);
		this.editor.removeOverlayWidget(this);
	}

	protected abstract _fillContainer(container: HTMLElement): void;

	getId(): string {
		return `${SidePanelWidget.ID}_${this.panelId}`;
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
		};
	}
}
