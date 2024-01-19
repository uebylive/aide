/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { Promises } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/modelSelectionWidgets';
import * as nls from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { asCssVariable, editorWidgetForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { isDark } from 'vs/platform/theme/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { COMMAND_CENTER_BORDER } from 'vs/workbench/common/theme';
import { IModelItemEntry } from 'vs/workbench/services/preferences/common/preferences';

export const defaultModelIcon = registerIcon('default-model-icon', Codicon.debugBreakpointDataUnverified, nls.localize('defaultModelIcon', 'Icon for the default model.'));
export const editModelWidgetCloseIcon = registerIcon('edit-model-widget-close-icon', Codicon.close, nls.localize('edit-model-widget-close-icon', 'Icon for the close button in the edit model widget.'));

export class EditModelConfigurationWidget extends Widget {
	private static readonly WIDTH = 400;
	private static readonly HEIGHT = 200;

	private _domNode: FastDomNode<HTMLElement>;
	private _contentContainer: HTMLElement;

	private _isVisible: boolean = false;
	private readonly title: HTMLElement;
	private readonly modelName: HTMLElement;
	private readonly providerValue: HTMLElement;
	private readonly contextLengthValue: InputBox;
	private readonly temperatureValue: InputBox;

	private _onHide = this._register(new Emitter<void>());

	constructor(
		parent: HTMLElement | null,
		@IContextViewService private readonly contextViewService: IContextViewService,
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

		this.title = dom.append(header, dom.$('.message'));
		const closeIcon = dom.append(header, dom.$(`.close-icon${ThemeIcon.asCSSSelector(editModelWidgetCloseIcon)}}`));
		closeIcon.title = nls.localize('editModelConfiguration.close', "Close");
		this._register(dom.addDisposableListener(closeIcon, dom.EventType.CLICK, () => this.hide()));

		const body = dom.append(this._contentContainer, dom.$('.edit-model-widget-body'));
		const modelNameContainer = dom.append(body, dom.$('.edit-model-widget-model-name-container'));
		dom.append(modelNameContainer, dom.$(`.model-icon${ThemeIcon.asCSSSelector(defaultModelIcon)}}`));
		this.modelName = dom.append(modelNameContainer, dom.$('.edit-model-widget-model-name'));

		const grid = dom.append(body, dom.$('.edit-model-widget-grid'));
		dom.append(grid, dom.$('span', undefined, nls.localize('editModelConfiguration.provider', "Provider")));
		this.providerValue = dom.append(grid, dom.$('span'));
		dom.append(grid, dom.$('span', undefined, nls.localize('editModelConfiguration.contextLength', "Context length")));
		this.contextLengthValue = this._register(new InputBox(grid, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles, type: 'number' }));
		this.contextLengthValue.element.classList.add('edit-model-widget-context-length');
		dom.append(grid, dom.$('span', undefined, nls.localize('editModelConfiguration.temperature', "Temperature")));
		this.temperatureValue = this._register(new InputBox(grid, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles, type: 'range' }));
		this.temperatureValue.element.classList.add('edit-model-widget-temperature');
		this.temperatureValue.inputElement.min = '-1';
		this.temperatureValue.inputElement.max = '1';
		this.temperatureValue.inputElement.step = '0.1';

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

	edit(entry: IModelItemEntry): Promise<string | null> {
		return Promises.withAsyncBody<string | null>(async (resolve) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');

				this.title.textContent = `Edit ${entry.modelItem.key}`;
				this.modelName.textContent = entry.modelItem.name;
				this.providerValue.textContent = entry.modelItem.provider.name;
				this.contextLengthValue.value = entry.modelItem.contextLength.toString();
				this.temperatureValue.value = entry.modelItem.temperature.toString();
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
