/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { CancellationToken } from 'vs/base/common/cancellation';
import 'vs/css!./media/modelSelectionEditor';
import { localize } from 'vs/nls';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { ModelSelectionEditorInput } from 'vs/workbench/services/preferences/browser/modelSelectionEditorInput';
import { ModelSelectionEditorModel } from 'vs/workbench/services/preferences/browser/modelSelectionEditorModel';
import { IModelItemEntry, IProviderItemEntry } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

export class ModelSelectionEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.modelSelectionEditor';

	private modelSelectionEditorModel: ModelSelectionEditorModel | null = null;

	private headerContainer!: HTMLElement;
	private modelsTableContainer!: HTMLElement;
	private providersTableContainer!: HTMLElement;

	private fastModelSelect!: HTMLSelectElement;
	private slowModelSelect!: HTMLSelectElement;
	private modelsTable!: WorkbenchTable<IModelItemEntry>;
	private providersTable!: WorkbenchTable<IProviderItemEntry>;

	private dimension: DOM.Dimension | null = null;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(ModelSelectionEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		const modelSelectionEditorElement = DOM.append(parent, $('div', { class: 'model-selection-editor' }));
		DOM.append(modelSelectionEditorElement, $('h2', undefined, 'Model Selection'));

		this.crateHeader(modelSelectionEditorElement);
		this.createBody(modelSelectionEditorElement);
	}

	private crateHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.model-selection-header'));

		const fastModelContainer = DOM.append(this.headerContainer, $('.fast-model'));
		DOM.append(fastModelContainer, $('span', undefined, 'Fast Model'));
		this.fastModelSelect = DOM.append(fastModelContainer, $('select'));

		const slowModelContainer = DOM.append(this.headerContainer, $('.slow-model'));
		DOM.append(slowModelContainer, $('span', undefined, 'Slow Model'));
		this.slowModelSelect = DOM.append(slowModelContainer, $('select'));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('div', { class: 'model-selection-body' }));
		this.createModelsTable(bodyContainer);
		this.createProvidersTable(bodyContainer);
	}

	private createModelsTable(parent: HTMLElement): void {
		this.modelsTableContainer = DOM.append(parent, $('div', { class: 'table-container' }));
		DOM.append(this.modelsTableContainer, $('h3', undefined, 'Models'));
		this.modelsTable = this._register(this.instantiationService.createInstance(WorkbenchTable,
			'ModelSelectionEditor',
			this.modelsTableContainer,
			new ModelDelegate(),
			[
				{
					label: localize('model', "Model"),
					tooltip: '',
					weight: 0.3,
					templateId: ModelsColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('provider', "Provider"),
					tooltip: '',
					weight: 0.7,
					templateId: ModelProvidersColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				}
			],
			[
				this.instantiationService.createInstance(ModelsColumnRenderer),
				this.instantiationService.createInstance(ModelProvidersColumnRenderer)
			],
			{
				identityProvider: { getId: (e: IModelItemEntry) => e.modelItem.name },
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
			}
		)) as WorkbenchTable<IModelItemEntry>;

		console.log(this.modelsTable);
		DOM.append(this.modelsTableContainer);
	}

	private createProvidersTable(parent: HTMLElement): void {
		this.providersTableContainer = DOM.append(parent, $('div', { class: 'table-container' }));
		DOM.append(this.providersTableContainer, $('h3', undefined, 'Providers'));
		this.providersTable = this._register(this.instantiationService.createInstance(WorkbenchTable,
			'ModelSelectionEditor',
			this.providersTableContainer,
			new ProviderDelegate(),
			[
				{
					label: localize('provider', "Provider"),
					tooltip: '',
					weight: 0.3,
					templateId: 'provider',
					project(row: IProviderItemEntry): IProviderItemEntry { return row; }
				}
			],
			[
				this.instantiationService.createInstance(ProviderColumnsRenderer)
			],
			{
				identityProvider: { getId: (e: IProviderItemEntry) => e.providerItem.name },
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
			}
		)) as WorkbenchTable<IProviderItemEntry>;

		console.log(this.providersTable);
		DOM.append(this.providersTableContainer);
	}

	private async render(): Promise<void> {
		if (this.input) {
			const input: ModelSelectionEditorInput = this.input as ModelSelectionEditorInput;
			this.modelSelectionEditorModel = await input.resolve();
			await this.modelSelectionEditorModel.resolve();
			this.renderModels();
			this.renderProviders();
		}
	}

	private renderModels(): void {
		if (this.modelSelectionEditorModel) {
			const modelItems = this.modelSelectionEditorModel.modelItems;
			this.modelsTable.splice(0, this.modelsTable.length, modelItems);
			this.layoutTables();
		}
	}

	private renderProviders(): void {
		if (this.modelSelectionEditorModel) {
			const providerItems = this.modelSelectionEditorModel.providerItems;
			this.providersTable.splice(0, this.providersTable.length, providerItems);
		}
	}

	private layoutTables(): void {
		if (!this.dimension) {
			return;
		}

		this.modelsTable.layout();
		this.providersTable.layout();
	}

	override async setInput(input: ModelSelectionEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		return await this.render();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		this.layoutTables();
	}
}

class ModelDelegate implements ITableVirtualDelegate<IModelItemEntry> {
	readonly headerRowHeight = 30;

	getHeight(element: IModelItemEntry): number {
		return 24;
	}
}

class ProviderDelegate implements ITableVirtualDelegate<IProviderItemEntry> {
	readonly headerRowHeight = 30;

	getHeight(element: IProviderItemEntry): number {
		return 24;
	}
}

interface IModelColumnTemplateData {
	modelColumn: HTMLElement;
	modelLabelContainer: HTMLElement;
	modelLabel: HighlightedLabel;
}

class ModelsColumnRenderer implements ITableRenderer<IModelItemEntry, IModelColumnTemplateData> {
	static readonly TEMPLATE_ID = 'model';

	readonly templateId: string = ModelsColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IModelColumnTemplateData {
		const modelColumn = DOM.append(container, $('.model'));
		const modelLabelContainer = DOM.append(modelColumn, $('.model-label'));
		const modelLabel = new HighlightedLabel(modelLabelContainer);
		return { modelColumn, modelLabelContainer, modelLabel };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IModelColumnTemplateData): void {
		const modelItem = modelItemEntry.modelItem;
		templateData.modelColumn.title = modelItem.name;

		if (modelItem.name) {
			templateData.modelLabelContainer.classList.remove('hide');
			templateData.modelLabel.set(modelItem.name, []);
		} else {
			templateData.modelLabelContainer.classList.add('hide');
			templateData.modelLabel.set(undefined);
		}
	}

	disposeTemplate(templateData: IModelColumnTemplateData): void { }
}

interface IModelProviderColumnTemplateData {
	modelProviderColumn: HTMLElement;
	providerLabelContainer: HTMLElement;
	providerLabel: HighlightedLabel;
}

class ModelProvidersColumnRenderer implements ITableRenderer<IModelItemEntry, IModelProviderColumnTemplateData> {
	static readonly TEMPLATE_ID = 'modelProvider';

	readonly templateId: string = ModelProvidersColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IModelProviderColumnTemplateData {
		const modelProviderColumn = DOM.append(container, $('.model-provider'));
		const providerLabelContainer = DOM.append(modelProviderColumn, $('.provider-label'));
		const providerLabel = new HighlightedLabel(providerLabelContainer);
		return { modelProviderColumn, providerLabelContainer, providerLabel };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IModelProviderColumnTemplateData): void {
		const modelItem = modelItemEntry.modelItem;
		templateData.modelProviderColumn.title = modelItem.name;

		if (modelItem.provider) {
			templateData.providerLabelContainer.classList.remove('hide');
			templateData.providerLabel.set(modelItem.provider, []);
		} else {
			templateData.providerLabelContainer.classList.add('hide');
			templateData.providerLabel.set(undefined);
		}
	}

	disposeTemplate(templateData: IModelProviderColumnTemplateData): void { }
}

interface IProviderColumnTemplateData {
	providerColumn: HTMLElement;
	providerLabelContainer: HTMLElement;
	providerLabel: HighlightedLabel;
}

class ProviderColumnsRenderer implements ITableRenderer<IProviderItemEntry, IProviderColumnTemplateData> {
	static readonly TEMPLATE_ID = 'provider';

	readonly templateId: string = ProviderColumnsRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IProviderColumnTemplateData {
		const providerColumn = DOM.append(container, $('.provider'));
		const providerLabelContainer = DOM.append(providerColumn, $('.provider-label'));
		const providerLabel = new HighlightedLabel(providerLabelContainer);
		return { providerColumn, providerLabelContainer, providerLabel };
	}

	renderElement(providerItemEntry: IProviderItemEntry, index: number, templateData: IProviderColumnTemplateData): void {
		const providerItem = providerItemEntry.providerItem;
		templateData.providerColumn.title = providerItem.name;

		if (providerItem.name) {
			templateData.providerLabelContainer.classList.remove('hide');
			templateData.providerLabel.set(providerItem.name, []);
		} else {
			templateData.providerLabelContainer.classList.add('hide');
			templateData.providerLabel.set(undefined);
		}
	}

	disposeTemplate(templateData: IProviderColumnTemplateData): void { }
}
