/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IChatAgentNameService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatResponseViewModel, ChatViewModel, IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatWelcomeMessageViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { ICSChatResponseModel, IChatEditSummary } from 'vs/workbench/contrib/chat/common/csChatModel';

export function isResponseVM(item: unknown): item is ICSChatResponseViewModel {
	return !!item && typeof (item as ICSChatResponseViewModel).setVote !== 'undefined';
}

export interface ICSChatViewModel extends IChatViewModel {
	getItems(): (IChatRequestViewModel | ICSChatResponseViewModel | IChatWelcomeMessageViewModel)[];
}

export interface ICSChatResponseViewModel extends IChatResponseViewModel {
	readonly appliedEdits: Map<number, IChatEditSummary>;
	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void;
}

export class CSChatViewModel extends ChatViewModel implements ICSChatViewModel {
	protected override onAddResponse(responseModel: ICSChatResponseModel) {
		const response = this.instantiationService.createInstance(CSChatResponseViewModel, responseModel);
		this._register(response.onDidChange(() => {
			this.updateCodeBlockTextModels(response);
			return this._onDidChange.fire(null);
		}));
		this._items.push(response);
		this.updateCodeBlockTextModels(response);
	}

	override getItems(): (IChatRequestViewModel | ICSChatResponseViewModel | IChatWelcomeMessageViewModel)[] {
		const items = super.getItems();
		return items as (IChatRequestViewModel | ICSChatResponseViewModel | IChatWelcomeMessageViewModel)[];
	}
}

export class CSChatResponseViewModel extends ChatResponseViewModel implements ICSChatResponseViewModel {
	constructor(
		protected override readonly _model: ICSChatResponseModel,
		@ILogService protected override readonly logService: ILogService,
		@IChatAgentNameService protected override readonly chatAgentNameService: IChatAgentNameService,
	) {
		super(_model, logService, chatAgentNameService);
	}

	get appliedEdits(): Map<number, IChatEditSummary> {
		return this._model.appliedEdits;
	}

	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void {
		this._modelChangeCount++;
		this._model.recordEdits(codeblockIndex, edits);
	}
}
