/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Location } from 'vs/editor/common/languages';
import { ChatModel, ChatResponseModel, IChatModel, IChatRequestModel, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';

export interface IChatEditSummary {
	summary: string;
	location: Location;
}

export interface ICSChatResponseModel extends IChatResponseModel {
	readonly appliedEdits: Map<number, IChatEditSummary>;
	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void;
}

export interface ICSChatModel extends IChatModel {
	getRequest(requestId: string): IChatRequestModel | undefined;
}

export class CSChatResponseModel extends ChatResponseModel implements ICSChatResponseModel {
	private readonly _appliedEdits: Map<number, IChatEditSummary> = new Map();
	public get appliedEdits(): Map<number, IChatEditSummary> {
		return this._appliedEdits;
	}

	recordEdits(codeblockIndex: number, edits: IChatEditSummary | undefined): void {
		if (edits) {
			this._appliedEdits.set(codeblockIndex, edits);
		} else {
			this._appliedEdits.delete(codeblockIndex);
		}
		this._onDidChange.fire();
	}
}

export class CSChatModel extends ChatModel implements ICSChatModel {
	getRequest(requestId: string): IChatRequestModel | undefined {
		return this._requests.find(request => request.id === requestId);
	}
}
