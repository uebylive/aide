/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { CodeLensList, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ICSChatWidgetService } from 'vs/workbench/contrib/csChat/browser/csChat';
import { ICSChatService } from 'vs/workbench/contrib/csChat/common/csChatService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class CSChatEditReviewLens extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ICSChatWidgetService private readonly csChatWidgetService: ICSChatWidgetService,
		@ICSChatService private readonly csChatService: ICSChatService
	) {
		super();

		this._register(this.languageFeaturesService.codeLensProvider.register({ scheme: '*', hasAccessToAllModels: true }, {
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

				const edits = this.csChatService.getEdits(sessionId, requestId);
				if (!edits || edits.length === 0) {
					return;
				}

				let foundUri = false;
				let startLineNumber = model.getLineCount();
				for (const editResponse of edits) {
					const edits = editResponse.edits.edits;
					for (const edit of edits) {
						if (isObject(edit) && URI.isUri((<IWorkspaceTextEdit>edit).resource) && isObject((<IWorkspaceTextEdit>edit).textEdit)) {
							const resource = (<IWorkspaceTextEdit>edit).resource;
							if (resource.toString() === model.uri.toString()) {
								foundUri = true;
								const textEdit = (<IWorkspaceTextEdit>edit).textEdit;
								startLineNumber = Math.min(startLineNumber, textEdit.range.startLineNumber);
							}
						}
					}
				}

				if (!foundUri) {
					return;
				}

				const range = {
					startLineNumber,
					startColumn: 1,
					endLineNumber: startLineNumber,
					endColumn: 1
				};

				return <CodeLensList>{
					lenses: [
						{ range, command: { id: 'csChat.editReview.approve', title: 'Approve Changes' } },
						{ range, command: { id: 'csChat.editReview.reject', title: 'Reject Changes' } }
					],
					dispose: () => { }
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CSChatEditReviewLens, LifecyclePhase.Eventually);
