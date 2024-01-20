/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { getCodiconAriaLabel } from 'vs/base/common/iconLabels';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/ModelSelectionIndicator';
import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IAIModelSelectionService, IModelProviders, ProviderConfig } from 'vs/platform/aiModel/common/aiModels';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

export class ModelSelectionIndicator extends Disposable implements IWorkbenchContribution {
	private static readonly SWITCH_MODEL_COMMAND_ID = 'workbench.action.modelSelection.switch';

	private modelSelectionStatusEntry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAIModelSelectionService private readonly aiModelSelectionService: IAIModelSelectionService
	) {
		super();

		this.registerActions();
		this.renderModelSelectionStatusIndicator();
	}

	private registerActions(): void {
		const category = { value: nls.localize('modelSelection.category', "Model Selection"), original: 'Model Selection' };

		const that = this;
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: ModelSelectionIndicator.SWITCH_MODEL_COMMAND_ID,
					category,
					title: { value: nls.localize('modelSelection.switch', "Switch Model"), original: 'Switch Model' },
					f1: true,
					keybinding: {
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyM),
					}
				});
			}
			run = () => that.showModelSwitcher();
		});
	}

	private renderModelSelectionStatusIndicator() {
		const text = '$(debug-breakpoint-data-unverified)';
		const properties: IStatusbarEntry = {
			name: nls.localize('modelSelection', "Model Selection"),
			kind: 'remote',
			ariaLabel: getCodiconAriaLabel(text),
			text,
			tooltip: nls.localize('modelSelection', "Model Selection"),
			command: ModelSelectionIndicator.SWITCH_MODEL_COMMAND_ID
		};

		if (this.modelSelectionStatusEntry) {
			this.modelSelectionStatusEntry.update(properties);
		} else {
			this.modelSelectionStatusEntry = this.statusbarService.addEntry(properties, 'status.aiModelSelection', StatusbarAlignment.RIGHT, -Number.MAX_VALUE);
		}
	}

	private showModelSwitcher(): void {
		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('modelSelectionPicker.placeholder', "Select model type");
		quickPick.title = nls.localize('modelSelectionPicker.title', "Select model type");
		quickPick.items = [
			{
				type: 'item',
				id: 'fastModel',
				label: 'Fast',
				ariaLabel: 'Fast',
				tooltip: 'Fast model'
			},
			{
				type: 'item',
				id: 'slowModel',
				label: 'Slow',
				ariaLabel: 'Slow',
				tooltip: 'Slow model'
			}
		];
		quickPick.step = 2;
		quickPick.totalSteps = 2;
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		quickPick.onDidAccept(() => {
			// const item = quickPick.selectedItems[0];
			quickPick.hide();
			this.showModelPicker();
		});

		quickPick.show();
	}

	private showModelPicker(): void {
		const computeItems = (): QuickPickItem[] => {
			const modelSelectionSettings = this.aiModelSelectionService.getModelSelectionSettings();
			const items: QuickPickItem[] = Object.keys(modelSelectionSettings.models).map(key => {
				const model = modelSelectionSettings.models[key as keyof typeof modelSelectionSettings.models];
				const provider = modelSelectionSettings.providers[model.provider as keyof IModelProviders] as ProviderConfig;
				const tooltip = new MarkdownString();
				tooltip.appendMarkdown(`### ${model.name}\n`);
				tooltip.appendMarkdown(`- **Provider**: ${provider.name}\n`);
				tooltip.appendMarkdown(`- **Context length**: ${model.contextLength}\n`);
				tooltip.appendMarkdown(`- **Temperature**: ${model.temperature}`);
				return {
					type: 'item',
					id: key,
					label: model.name,
					ariaLabel: model.name,
					detail: provider.name,
					tooltip,
					iconClasses: ['model-selection-picker', 'model-icon'],
					buttons: [{
						iconClass: ThemeIcon.asClassName(Codicon.edit),
						tooltip: nls.localize('modelSelection.edit', "Edit"),
					}],
					picked: modelSelectionSettings.slowModel === key
				} as QuickPickItem;
			});
			return items;
		};

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('modelSelection.placeholder', "Select a model");
		quickPick.title = nls.localize('modelSelection.title', "Select a model");
		quickPick.items = computeItems();
		quickPick.step = 2;
		quickPick.totalSteps = 2;
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;

		quickPick.show();
	}
}
