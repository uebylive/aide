/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { CodeLensList, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditConfirmationAction } from 'vs/workbench/contrib/csChat/browser/actions/csChatCodeblockActions';
import { ICSChatWidgetService } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ICSChatService } from 'vs/workbench/contrib/csChat/common/csChatService';
import { isResponseVM } from 'vs/workbench/contrib/csChat/common/csChatViewModel';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class CSChatEditReviewLens extends Disposable {
	static selector = 'file';

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ICSChatWidgetService private readonly csChatWidgetService: ICSChatWidgetService,
		@ICSChatService private readonly csChatService: ICSChatService
	) {
		super();

		this._register(this.languageFeaturesService.codeLensProvider.register({ scheme: CSChatEditReviewLens.selector, hasAccessToAllModels: true }, {
			provideCodeLenses: (model: ITextModel, token: CancellationToken) => {
				const widget = this.csChatWidgetService.lastFocusedWidget;
				if (!widget) {
					return;
				}

				const sessionId = widget.viewModel?.sessionId;
				const requestId = widget.viewModel?.activeEditsRequestId;
				if (!sessionId || !requestId) {
					return;
				}

				const responseVM = widget.viewModel?.getItems().find(item => isResponseVM(item) && item.requestId === requestId);
				if (!isResponseVM(responseVM)) {
					return;
				}

				const editsByCodeblock = this.csChatService.getEditsByCodeblock(sessionId, requestId);
				if (!editsByCodeblock) {
					return;
				}

				let foundUri = false;
				const codeblockRanges: { [codeblockIndex: number]: Range } = {};
				for (const codeblockEdits of editsByCodeblock) {
					for (const workspaceEdit of codeblockEdits[1].edits) {
						for (const e of workspaceEdit.edits) {
							const edit = e as IWorkspaceTextEdit;
							if (edit.resource.toString() !== model.uri.toString()) {
								continue;
							}

							foundUri = true;
							const codeblockIndex = codeblockEdits[0];
							const codeblockRange = codeblockRanges[codeblockIndex] || Range.lift(edit.textEdit.range);
							codeblockRanges[codeblockIndex] = codeblockRange.plusRange(edit.textEdit.range);
						}
					}
				}

				if (!foundUri) {
					return;
				}

				const lenses = Object.keys(codeblockRanges).map(codeblockIndex => {
					const codeblockRange = codeblockRanges[Number(codeblockIndex)];
					const approveCommand = {
						id: EditConfirmationAction.ID,
						title: 'Approve edits',
						arguments: [{ codeblockIndex: Number(codeblockIndex), responseVM, type: 'approve' }]
					};
					const rejectCommand = {
						id: EditConfirmationAction.ID,
						title: 'Reject edits',
						arguments: [{ codeblockIndex: Number(codeblockIndex), responseVM, type: 'reject' }]
					};
					return [
						{
							range: codeblockRange,
							command: approveCommand
						},
						{
							range: codeblockRange,
							command: rejectCommand
						}
					];
				}).flat();

				return <CodeLensList>{
					lenses,
					dispose: () => { }
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CSChatEditReviewLens, LifecyclePhase.Eventually);
