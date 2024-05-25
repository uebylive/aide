/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { ChatAgentService, IChatAgentService, IChatAgent, ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';

export interface ICSChatAgent extends IChatAgent {
	provideEdits?(request: IChatAgentEditRequest, progress: (part: ICSChatAgentEditResponse) => void, token: CancellationToken): Promise<ICSChatAgentEditResponse | undefined>;
}

interface IChatAgentEditContext {
	code: string;
	languageId?: string;
	codeBlockIndex: number;
}

export interface IChatAgentEditRequest {
	sessionId: string;
	agentId: string;
	responseId: string;
	response: string;
	context: IChatAgentEditContext[];
}

export interface ICSChatAgentEditResponse {
	edits: WorkspaceEdit;
	codeBlockIndex: number;
}

export class CSChatAgentService extends ChatAgentService implements IChatAgentService {
	async makeEdits(context: IChatAgentEditRequest, progress: (part: ICSChatAgentEditResponse) => void, token: CancellationToken): Promise<ICSChatAgentEditResponse | undefined> {
		const agentId = context.agentId;
		const data = this.getDefaultAgent(ChatAgentLocation.Panel);
		if (!data) {
			throw new Error(`No agent with id ${agentId}`);
		}

		if (!data?.provideEdits) {
			return;
		}

		return data.provideEdits(context, progress, token);
	}
}
