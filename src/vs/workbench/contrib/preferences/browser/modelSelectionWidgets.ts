/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Widget } from 'vs/base/browser/ui/widget';
import { Promises } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/modelSelectionWidgets';
import * as nls from 'vs/nls';
import { asCssVariable, editorWidgetForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { isDark } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { COMMAND_CENTER_BORDER } from 'vs/workbench/common/theme';

const editModelWidgetCloseIcon = registerIcon('edit-model-widget-close-icon', Codicon.close, nls.localize('edit-model-widget-close-icon', 'Icon for the close button in the edit model widget.'));

export class EditModelConfigurationWidget extends Widget {
	private static readonly WIDTH = 800;
	private static readonly HEIGHT = 400;

	private _domNode: FastDomNode<HTMLElement>;
	private _contentContainer: HTMLElement;

	private _isVisible: boolean = false;

	private _onHide = this._register(new Emitter<void>());

	constructor(
		parent: HTMLElement | null,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setDisplay('none');
		this._domNode.setClassName('edit-model-widget');
		this._domNode.setWidth(EditModelConfigurationWidget.WIDTH);
		this._domNode.setHeight(EditModelConfigurationWidget.HEIGHT);
		this._register(dom.addDisposableListener(this._domNode.domNode, dom.EventType.KEY_PRESS, (e: KeyboardEvent) => {
			if (e.key === KeyCode.Escape.toString()) {
				this.hide();
			}
		}));
		this._register(dom.addDisposableListener(this._domNode.domNode, dom.EventType.BLUR, () => {
			this.hide();
		}, true));

		this._contentContainer = dom.append(this._domNode.domNode, dom.$('.edit-model-widget-content'));
		const header = dom.append(this._contentContainer, dom.$('.edit-model-widget-header'));

		const message = nls.localize('editModelConfiguration.initial', "Edit model configuration");
		dom.append(header, dom.$('.message', undefined, message));
		const closeIcon = dom.append(header, dom.$(`.close-icon${ThemeIcon.asCSSSelector(editModelWidgetCloseIcon)}}`));
		closeIcon.title = nls.localize('editModelConfiguration.close', "Close");
		this._register(dom.addDisposableListener(closeIcon, dom.EventType.CLICK, () => this.hide()));

		dom.append(this._contentContainer, dom.$('.edit-model-widget-body'));
		this.updateStyles();

		this._register(this._themeService.onDidColorThemeChange(() => {
			this.updateStyles();
		}));

		if (parent) {
			dom.append(parent, this._domNode.domNode);
		}
	}

	private updateStyles(): void {
		this._domNode.domNode.style.color = asCssVariable(editorWidgetForeground);
		this._domNode.domNode.style.border = `0.5px solid ${asCssVariable(COMMAND_CENTER_BORDER)}`;
		this._domNode.domNode.style.boxShadow = `0 0 8px 2px ${asCssVariable(widgetShadow)}`;
		this._domNode.domNode.style.backdropFilter = isDark(this._themeService.getColorTheme().type)
			? 'blur(20px) saturate(190%) contrast(70%) brightness(80%)' : 'blur(25px) saturate(190%) contrast(50%) brightness(130%)';
	}

	edit(): Promise<string | null> {
		return Promises.withAsyncBody<string | null>(async (resolve) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');
			}
			const disposable = this._onHide.event(() => {
				disposable.dispose();
				resolve(null);
			});
		});
	}

	layout(layout: dom.Dimension): void {
		const top = Math.round((layout.height - EditModelConfigurationWidget.HEIGHT) / 3);
		this._domNode.setTop(top);

		const left = Math.round((layout.width - EditModelConfigurationWidget.WIDTH) / 2);
		this._domNode.setLeft(left);
	}

	hide(): void {
		this._domNode.setDisplay('none');
		this._isVisible = false;
		this._onHide.fire();
	}
}
