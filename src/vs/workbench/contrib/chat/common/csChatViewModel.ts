/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { ChatResponseViewModel, IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { ICSChatResponseModel, IChatEditSummary } from 'vs/workbench/contrib/chat/common/csChatModel';

export function isResponseVM(item: unknown): item is ICSChatResponseViewModel {
	return !!item && typeof (item as ICSChatResponseViewModel).setVote !== 'undefined';
}

export interface ICSChatResponseViewModel extends IChatResponseViewModel {
	readonly appliedEdits: Map<number, IChatEditSummary>;
	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void;
}

export class CSChatResponseViewModel extends ChatResponseViewModel implements ICSChatResponseViewModel {
	constructor(
		protected override readonly _model: ICSChatResponseModel,
		@ILogService protected override readonly logService: ILogService
	) {
		super(_model, logService);
	}

	get appliedEdits(): Map<number, IChatEditSummary> {
		return this._model.appliedEdits;
	}

	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void {
		this._modelChangeCount++;
		this._model.recordEdits(codeblockIndex, edits);
	}
}
