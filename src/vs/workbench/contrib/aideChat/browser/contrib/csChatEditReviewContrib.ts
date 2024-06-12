/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { CodeLensList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditConfirmationAction } from 'vs/workbench/contrib/aideChat/browser/actions/aideChatCodeblockActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IAideChatEditSessionService } from 'vs/workbench/contrib/aideChat/browser/aideChatEdits';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class AideChatEditReviewLens extends Disposable {
	static selector = 'file';

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAideChatEditSessionService private readonly csChatEditSessionService: IAideChatEditSessionService,
		@IChatWidgetService private readonly csChatWidgetService: IChatWidgetService,
	) {
		super();

		this._register(this.languageFeaturesService.codeLensProvider.register({ scheme: AideChatEditReviewLens.selector, hasAccessToAllModels: true }, {
			provideCodeLenses: (model: ITextModel, token: CancellationToken) => {
				const { isEditing, activeEditCodeblockNumber: codeblockIndex, activeEditResponseId: responseId } = this.csChatEditSessionService;
				if (isEditing || codeblockIndex === undefined || codeblockIndex < 0) {
					return;
				}

				const editRanges = this.csChatEditSessionService.getEditRangesInProgress(model.uri);
				if (!editRanges) {
					return;
				}

				if (token.isCancellationRequested) {
					return;
				}

				const lenses = editRanges.map(location => {
					const lastFocusedWidget = this.csChatWidgetService.lastFocusedWidget;
					const approveCommand = {
						id: EditConfirmationAction.ID,
						title: 'Approve edits',
						arguments: [{ responseId, codeblockIndex, type: 'approve', uri: model.uri, widget: lastFocusedWidget }]
					};
					const rejectCommand = {
						id: EditConfirmationAction.ID,
						title: 'Reject edits',
						arguments: [{ responseId, codeblockIndex, type: 'reject', uri: model.uri, widget: lastFocusedWidget }]
					};
					return [
						{
							range: location.range,
							command: approveCommand
						},
						{
							range: location.range,
							command: rejectCommand
						}
					];
				}).flat();

				return <CodeLensList>{
					lenses,
					dispose: () => { }
				};
			},
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AideChatEditReviewLens, LifecyclePhase.Eventually);

