/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { IWordAtPosition, getWordAtText } from 'vs/editor/common/core/wordHelper';
import { Range } from 'vs/editor/common/core/range';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { MultiLevelCodeTriggerAction } from 'vs/workbench/contrib/aideProbe/browser/contrib/aideControlsDynamicVariables';
import { AideControls, IAideControlsService } from 'vs/workbench/contrib/aideProbe/browser/aideControls';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
// import { ChatRequestVariablePart } from 'vs/workbench/contrib/aideProbe/common/aideProbeParserTypes';
// import { IAideChatVariablesService } from 'vs/workbench/contrib/aideChat/common/aideChatVariables';

const probeVariableLeader = '#';

class BuiltinDynamicCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${probeVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideControlsService private readonly aideControlsService: IAideControlsService
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: AideControls.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'probeDynamicCompletions',
			triggerCharacters: [probeVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {

				const aideControls = this.aideControlsService.controls;

				if (!aideControls) {
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
							label: `${probeVariableLeader}file`,
							insertText: `${probeVariableLeader}file:`,
							detail: localize('pickFileReferenceLabel', "Pick a file"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ inputEditor: aideControls.inputEditor, range: afterRange, pick: 'file' }] },
							sortText: 'z'
						},
						<CompletionItem>{
							label: `${probeVariableLeader}code`,
							insertText: `${probeVariableLeader}code:`,
							detail: localize('pickCodeSymbolLabel', "Pick a code symbol"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ inputEditor: aideControls.inputEditor, range: afterRange, pick: 'code' }] },
							sortText: 'z'
						},
						<CompletionItem>{
							label: `${probeVariableLeader}folder`,
							insertText: `${probeVariableLeader}folder:`,
							detail: localize('pickFolderReferenceLabel', "Pick a folder"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: MultiLevelCodeTriggerAction.ID, title: MultiLevelCodeTriggerAction.ID, arguments: [{ inputEditor: aideControls.inputEditor, range: afterRange, pick: 'folder' }] },
							sortText: 'z'
						}
					]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

// class VariableCompletions extends Disposable {

// 	private static readonly VariableNameDef = new RegExp(`${probeVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

// 	constructor(
// 		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
// 		@IAideControlsService private readonly aideControlsService: IAideControlsService,
// 		@IAideChatVariablesService private readonly chatVariablesService: IAideChatVariablesService,
// 	) {
// 		super();

// 		this._register(this.languageFeaturesService.completionProvider.register({ scheme: AideControls.INPUT_SCHEME, hasAccessToAllModels: true }, {
// 			_debugDisplayName: 'probeVariables',
// 			triggerCharacters: [probeVariableLeader],
// 			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {


// 				const widget = this.aideControlsService.controls;
// 				if (!widget) {
// 					return null;
// 				}

// 				const range = computeCompletionRanges(model, position, VariableCompletions.VariableNameDef);
// 				if (!range) {
// 					return null;
// 				}


// 				const usedVariables = widget.parsedInput.parts.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
// 				const variableItems = Array.from(this.chatVariablesService.getVariables())
// 					// This doesn't look at dynamic variables like `file`, where multiple makes sense.
// 					.filter(v => !usedVariables.some(usedVar => usedVar.variableName === v.name))
// 					.filter(v => !v.isSlow)
// 					.map((v): CompletionItem => {
// 						const withLeader = `${probeVariableLeader}${v.name}`;
// 						return {
// 							label: withLeader,
// 							range,
// 							insertText: withLeader + ' ',
// 							detail: v.description,
// 							kind: CompletionItemKind.Text, // The icons are disabled here anyway
// 							sortText: 'z'
// 						};
// 					});

// 				return {
// 					suggestions: variableItems
// 				};
// 			}
// 		}));
// 	}
// }

// Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletions, LifecyclePhase.Eventually);


export function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp): { insert: Range; replace: Range; varWord: IWordAtPosition | null } | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}
