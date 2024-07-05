/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { CodeSymbolCompletionProviderName, MultiLevelCodeTriggerAction } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatDynamicVariables';
import { computeCompletionRanges } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatInputCompletions';
import { CodeSymbolCompletionProvider } from 'vs/workbench/contrib/aideChat/browser/contrib/aideChatInputEditorContrib';
import { showProbeView } from 'vs/workbench/contrib/aideProbe/browser/aideProbe';
import { AideProbeInputPart } from 'vs/workbench/contrib/aideProbe/browser/aideProbeInputPart';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

const probeVariableLeader = '#';

class BuiltinDynamicCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${probeVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IViewsService private readonly viewsService: IViewsService
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: AideProbeInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatDynamicCompletions',
			triggerCharacters: [probeVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const probeView = await showProbeView(this.viewsService);
				if (!probeView) {
					return null;
				}

				const range = computeCompletionRanges(model, position, BuiltinDynamicCompletions.VariableNameDef);
				if (!range) {
					return null;
				}

				const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#file:'.length);
				return <CompletionList>{
					suggestions: [
						<CompletionItem>{
							label: `${probeVariableLeader}code`,
							insertText: `${probeVariableLeader}code:`,
							detail: localize('pickCodeSymbolLabel', "Pick a code symbol"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ inputEditor: probeView.getInputEditor(), range: afterRange, pick: 'code' }] },
							sortText: 'z'
						}
					]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

class CodeSymbolCompletions extends Disposable {
	static readonly VariableNameDef = new RegExp(`${probeVariableLeader}code:\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: AideProbeInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: CodeSymbolCompletionProviderName,
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const codeSymbolCompletionsProvider = this._register(this.instantiationService.createInstance(CodeSymbolCompletionProvider));
				return codeSymbolCompletionsProvider.provideCompletionItems(model, position, _context, _token);
			}
		}));
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CodeSymbolCompletions, LifecyclePhase.Eventually);
