/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICSChatMessage } from 'vs/workbench/contrib/csChat/common/csChatProvider';
import { ICSChatFollowup, ICSChatProgress, IChatResponseErrorDetails } from 'vs/workbench/contrib/csChat/common/csChatService';
import { ICSChatRequestVariableValue } from 'vs/workbench/contrib/csChat/common/csChatVariables';

//#region agent service, commands etc

export interface IChatAgentData {
	id: string;
	metadata: ICSChatAgentMetadata;
}

export interface IChatAgent extends IChatAgentData {
	invoke(request: ICSChatAgentRequest, progress: (part: ICSChatProgress) => void, history: ICSChatMessage[], token: CancellationToken): Promise<ICSChatAgentResult>;
	provideFollowups?(sessionId: string, token: CancellationToken): Promise<ICSChatFollowup[]>;
	provideSlashCommands(token: CancellationToken): Promise<ICSChatAgentCommand[]>;
	provideEdits?(request: ICSChatAgentEditRequest, progress: (part: ICSChatAgentEditRepsonse) => void, token: CancellationToken): Promise<ICSChatAgentEditRepsonse | undefined>;
}

export interface ICSChatAgentCommand {
	name: string;
	description: string;

	/**
	 * Whether the command should execute as soon
	 * as it is entered. Defaults to `false`.
	 */
	executeImmediately?: boolean;

	/**
	 * Whether executing the command puts the
	 * chat into a persistent mode, where the
	 * slash command is prepended to the chat input.
	 */
	shouldRepopulate?: boolean;

	/**
	 * Placeholder text to render in the chat input
	 * when the slash command has been repopulated.
	 * Has no effect if `shouldRepopulate` is `false`.
	 */
	followupPlaceholder?: string;

	sampleRequest?: string;
}

export interface ICSChatAgentMetadata {
	description?: string;
	isDefault?: boolean; // The agent invoked when no agent is specified
	helpTextPrefix?: string | IMarkdownString;
	helpTextPostfix?: string | IMarkdownString;
	isSecondary?: boolean; // Invoked by ctrl/cmd+enter
	fullName?: string;
	icon?: URI;
	iconDark?: URI;
	themeIcon?: ThemeIcon;
	sampleRequest?: string;
	supportIssueReporting?: boolean;
}

export interface ICSChatAgentRequest {
	sessionId: string;
	requestId: string;
	command?: string;
	message: string;
	variables: Record<string, ICSChatRequestVariableValue[]>;
}

export interface ICSChatAgentResult {
	// delete, keep while people are still using the previous API
	followUp?: ICSChatFollowup[];
	errorDetails?: IChatResponseErrorDetails;
	timings?: {
		firstProgress?: number;
		totalElapsed: number;
	};
}

interface ICSChatAgentEditContext {
	code: string;
	languageId: string;
	codeBlockIndex: number;
}

export interface ICSChatAgentEditRequest {
	sessionId: string;
	agentId: string;
	responseId: string;
	response: string;
	context: ICSChatAgentEditContext[];
}

export interface ICSChatAgentEditRepsonse {
	edits: WorkspaceEdit;
}

export const ICSChatAgentService = createDecorator<ICSChatAgentService>('csChatAgentService');

export interface ICSChatAgentService {
	_serviceBrand: undefined;
	readonly onDidChangeAgents: Event<void>;
	registerAgent(agent: IChatAgent): IDisposable;
	invokeAgent(id: string, request: ICSChatAgentRequest, progress: (part: ICSChatProgress) => void, history: ICSChatMessage[], token: CancellationToken): Promise<ICSChatAgentResult>;
	getEdits(context: ICSChatAgentEditRequest, progress: (part: ICSChatAgentEditRepsonse) => void, token: CancellationToken): Promise<ICSChatAgentEditRepsonse | undefined>;
	getFollowups(id: string, sessionId: string, token: CancellationToken): Promise<ICSChatFollowup[]>;
	getAgents(): Array<IChatAgent>;
	getAgent(id: string): IChatAgent | undefined;
	getDefaultAgent(): IChatAgent | undefined;
	getSecondaryAgent(): IChatAgent | undefined;
	hasAgent(id: string): boolean;
	updateAgent(id: string, updateMetadata: ICSChatAgentMetadata): void;
}

export class ChatAgentService extends Disposable implements ICSChatAgentService {

	declare _serviceBrand: undefined;

	private readonly _agents = new Map<string, { agent: IChatAgent }>();

	private readonly _onDidChangeAgents = this._register(new Emitter<void>());
	readonly onDidChangeAgents: Event<void> = this._onDidChangeAgents.event;

	override dispose(): void {
		super.dispose();
		this._agents.clear();
	}

	registerAgent(agent: IChatAgent): IDisposable {
		if (this._agents.has(agent.id)) {
			throw new Error(`Already registered an agent with id ${agent.id}`);
		}
		this._agents.set(agent.id, { agent });
		this._onDidChangeAgents.fire();

		return toDisposable(() => {
			if (this._agents.delete(agent.id)) {
				this._onDidChangeAgents.fire();
			}
		});
	}

	updateAgent(id: string, updateMetadata: ICSChatAgentMetadata): void {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id} registered`);
		}
		data.agent.metadata = { ...data.agent.metadata, ...updateMetadata };
		this._onDidChangeAgents.fire();
	}

	getDefaultAgent(): IChatAgent | undefined {
		return Iterable.find(this._agents.values(), a => !!a.agent.metadata.isDefault)?.agent;
	}

	getSecondaryAgent(): IChatAgent | undefined {
		return Iterable.find(this._agents.values(), a => !!a.agent.metadata.isSecondary)?.agent;
	}

	getAgents(): Array<IChatAgent> {
		return Array.from(this._agents.values(), v => v.agent);
	}

	hasAgent(id: string): boolean {
		return this._agents.has(id);
	}

	getAgent(id: string): IChatAgent | undefined {
		const data = this._agents.get(id);
		return data?.agent;
	}

	async invokeAgent(id: string, request: ICSChatAgentRequest, progress: (part: ICSChatProgress) => void, history: ICSChatMessage[], token: CancellationToken): Promise<ICSChatAgentResult> {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id}`);
		}

		return await data.agent.invoke(request, progress, history, token);
	}

	async getFollowups(id: string, sessionId: string, token: CancellationToken): Promise<ICSChatFollowup[]> {
		const data = this._agents.get(id);
		if (!data) {
			throw new Error(`No agent with id ${id}`);
		}

		if (!data.agent.provideFollowups) {
			return [];
		}

		return data.agent.provideFollowups(sessionId, token);
	}

	async getEdits(context: ICSChatAgentEditRequest, progress: (part: ICSChatAgentEditRepsonse) => void, token: CancellationToken): Promise<ICSChatAgentEditRepsonse | undefined> {
		const agentId = context.agentId;
		const data = this._agents.get(agentId);
		if (!data) {
			throw new Error(`No agent with id ${agentId}`);
		}

		if (!data.agent.provideEdits) {
			return;
		}

		return data.agent.provideEdits(context, progress, token);
	}
}
