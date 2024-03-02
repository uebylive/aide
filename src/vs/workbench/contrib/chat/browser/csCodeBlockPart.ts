/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { basename } from 'vs/base/common/path';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { ISimpleCodeBlockData, SimpleCodeBlockPart } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ICSChatEditSessionService } from 'vs/workbench/contrib/chat/browser/csChatEdits';
import { IChatEditSummary } from 'vs/workbench/contrib/chat/common/csChatModel';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/csChatViewModel';

const $ = dom.$;

export interface ICSSimpleCodeBlockData extends ISimpleCodeBlockData {
	edits?: IChatEditSummary | undefined;
}

export class CSSimpleCodeBlockPart extends SimpleCodeBlockPart {
	public readonly wrapperElement: HTMLElement;

	private readonly exportedLocationRibbon: HTMLElement;

	constructor(
		options: ChatEditorOptions,
		menuId: MenuId,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageService languageService: ILanguageService,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@ICSChatEditSessionService private readonly editSessionService: ICSChatEditSessionService,
	) {
		super(options, menuId, delegate, overflowWidgetsDomNode, instantiationService, contextKeyService, modelService, textModelService, configurationService, accessibilityService, languageService);

		const parent = this.element.parentElement;
		this.wrapperElement = $('.interactive-result-editor-wrapper');
		this.wrapperElement.appendChild(this.element);
		parent?.replaceChildren(this.wrapperElement);

		this.exportedLocationRibbon = $('.interactive-result-editor-location-ribbon');
		const resultEditorNode = this.wrapperElement.firstChild;
		resultEditorNode?.after(this.exportedLocationRibbon);
	}

	override async render(data: ICSSimpleCodeBlockData, width: number): Promise<void> {
		await super.render(data, width);

		dom.clearNode(this.exportedLocationRibbon);
		const isApplyingEdits = isResponseVM(data.element) && (this.editSessionService.activeEditCodeblockNumber ?? -1) >= 0;
		if (isApplyingEdits) {
			if (!this.element.classList.contains('applying-edits')) {
				this.element.classList.add('applying-edits');
			}
		} else {
			this.element.classList.remove('applying-edits');
		}
		if (isResponseVM(data.element) && data.edits && data.element.appliedEdits.get(data.codeBlockIndex)) {
			const summary = this.exportedLocationRibbon.appendChild($('div.edit-summary', undefined));
			const rangeText = basename(data.edits.location.uri.toString()) + ':' + data.edits.location.range.startLineNumber + ':' + data.edits.location.range.endLineNumber;
			dom.append(summary, $('span.editor-location-text', undefined, rangeText));
			if (rangeText.length <= 30) {
				dom.append(summary, $('span.edit-summary-text', undefined, data.edits.summary));
			}
		}
		if (isResponseVM(data.element) && (this.editSessionService.activeEditCodeblockNumber ?? -1) < 0 && data.element.appliedEdits.get(data.codeBlockIndex)) {
			this.element.classList.toggle('approved-edits', true);
		} else {
			this.element.classList.toggle('approved-edits', false);
		}

		this.exportedLocationRibbon.onclick = () => {
			if (isResponseVM(data.element) && data.edits) {
				this.editorService.openCodeEditor({
					resource: data.edits.location.uri,
					options: {
						selection: data.edits.location.range,
						preserveFocus: true,
						pinned: true,
						revealIfVisible: true,
					}
				}, this.editor);
			}
		};
	}
}
