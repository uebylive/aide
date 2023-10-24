/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';

const $ = dom.$;

export class CSAgentRequestBlock extends Disposable {
	static readonly INPUT_SCHEME = 'csAgentRequestBlockInput';

	private container!: HTMLElement;

	private _inputEditor!: CodeEditorWidget;
	private _inputEditorElement!: HTMLElement;

	get inputEditor() {
		return this._inputEditor;
	}

	private inputModel: ITextModel | undefined;

	readonly inputUri = URI.parse(`${CSAgentRequestBlock.INPUT_SCHEME}:input-${Date.now()}`);

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	render(container: HTMLElement): void {
		this.container = dom.append(container, $('.cs-agent-request-block'));
		const inputContainer = dom.append(this.container, $('.cs-agent-request-block-input'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const options = getSimpleEditorOptions(this.configurationService);
		options.readOnly = false;
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 8 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';
		options.bracketPairColorization = { enabled: false };

		this._inputEditorElement = dom.append(inputContainer, $('.cs-agent-request-block-input-editor'));
		const editorOptions = getSimpleCodeEditorWidgetOptions();
		editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ModesHoverController.ID]));
		this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));

		this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
		this._inputEditor.setModel(this.inputModel);
	}

	layout(height: number, width: number): number {
		return this._layout(height, width);
	}

	private _layout(height: number, width: number): number {
		this._inputEditor.layout({ height, width });

		return height;
	}
}
