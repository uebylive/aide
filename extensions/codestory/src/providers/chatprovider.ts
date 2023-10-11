/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

import logger from '../logger';
import { CSChatState } from '../chatState/state';
import { getSelectedCodeContext } from '../utilities/getSelectionContext';
import { generateChatCompletion, generateChatCompletionAx } from '../chatState/openai';
import { logChatPrompt, logSearchPrompt } from '../posthog/logChatPrompt';
import { formatPathsInAnswer, reportFromStreamToProgress, reportFromStreamToSearchProgress } from '../chatState/convertStreamToMessage';
import { CodeGraph } from '../codeGraph/graph';
import { createContextPrompt, getContextForPromptFromUserContext, getRelevantContextForCodeSelection } from '../chatState/getContextForCodeSelection';
import { debuggingFlow } from '../llm/recipe/debugging';
import { ToolingEventCollection } from '../timeline/events/collection';
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { deterministicClassifier, promptClassifier } from '../chatState/promptClassifier';
import { CodeSymbolsLanguageCollection } from '../languages/codeSymbolsLanguageCollection';
import { SearchIndexCollection } from '../searchIndex/collection';
import { RepoRef, SideCarClient } from '../sidecar/client';

class CSChatSessionState implements vscode.InteractiveSessionState {
	public chatContext: CSChatState;

	constructor(agentCustomInstruction: string | null) {
		this.chatContext = new CSChatState(
			agentCustomInstruction,
		);
	}
}

class CSChatParticipant implements vscode.InteractiveSessionParticipantInformation {
	name: string;
	icon?: vscode.Uri | undefined;

	constructor(name: string, icon?: vscode.Uri | undefined) {
		this.name = name;
		this.icon = icon;
	}

	toString(): string {
		return `CSChatParticipant { name: "${this.name}", icon: "${this.icon?.toString()}" }`;
	}
}

class CSChatSession implements vscode.InteractiveSession {
	requester: CSChatParticipant;
	responder: CSChatParticipant;
	inputPlaceholder?: string | undefined;
	agentCustomInstruction: string | null;
	public chatSessionState: CSChatSessionState;

	saveState(): CSChatSessionState {
		logger.info('Saving state' + this.toString());
		return this.chatSessionState;
	}

	constructor(
		requester: CSChatParticipant,
		responder: CSChatParticipant,
		initialState: CSChatSessionState | undefined,
		agentCustomInstruction: string | null,
		inputPlaceholder?: string | undefined,
	) {
		this.requester = requester;
		this.responder = responder;
		this.inputPlaceholder = inputPlaceholder;
		this.agentCustomInstruction = agentCustomInstruction;
		this.chatSessionState = initialState ?? new CSChatSessionState(
			this.agentCustomInstruction,
		);
	}

	toString(): string {
		return `CSChatSession { requester: ${this.requester.toString()}, responder: ${this.responder.toString()}, inputPlaceholder: "${this.inputPlaceholder}" }`;
	}
}

class CSChatRequestArgs implements vscode.InteractiveSessionRequestArgs {
	command: string;
	args: any;

	constructor(command: string, args: any) {
		this.command = command;
		this.args = args;
	}

	toString(): string {
		return `CSChatRequestArgs { command: "${this.command}", args: ${JSON.stringify(this.args, null, 2)} }`;
	}
}

class CSChatReplyFollowup implements vscode.InteractiveSessionReplyFollowup {
	message: string;
	tooltip?: string | undefined;
	title?: string | undefined;
	metadata?: any;

	constructor(message: string, tooltip?: string | undefined, title?: string | undefined, metadata?: any) {
		this.message = message;
		this.tooltip = tooltip;
		this.title = title;
		this.metadata = metadata;
	}

	toString(): string {
		return `CSChatReplyFollowup { message: "${this.message}", tooltip: "${this.tooltip}", title: "${this.title}", metadata: ${JSON.stringify(this.metadata, null, 2)} }`;
	}
}

export class CSChatRequest implements vscode.InteractiveRequest {
	session: CSChatSession;
	message: string | CSChatReplyFollowup;
	userProvidedContext: vscode.InteractiveUserProvidedContext | undefined;

	constructor(session: CSChatSession, message: string | CSChatReplyFollowup) {
		this.session = session;
		this.message = message;
	}

	toString(): string {
		return `CSChatRequest { session: ${this.session.toString()}, message: ${this.message.toString()} }`;
	}
}

class CSChatResponseErrorDetails implements vscode.InteractiveResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean | undefined;
	responseIsFiltered?: boolean | undefined;

	constructor(message: string, responseIsIncomplete?: boolean | undefined, responseIsFiltered?: boolean | undefined) {
		this.message = message;
		this.responseIsIncomplete = responseIsIncomplete;
		this.responseIsFiltered = responseIsFiltered;
	}

	toString(): string {
		return `CSChatResponseErrorDetails { message: "${this.message}", responseIsIncomplete: "${this.responseIsIncomplete}", responseIsFiltered: "${this.responseIsFiltered}" }`;
	}
}

export class CSChatProgressContent implements vscode.InteractiveProgressContent {
	content: string | vscode.MarkdownString;

	constructor(content: string | vscode.MarkdownString) {
		this.content = content;
	}

	toString(): string {
		return `CSChatProgressContent { content: "${this.content}" }`;
	}
}

class CSChatProgressId implements vscode.InteractiveProgressId {
	responseId: string;

	constructor(responseId: string) {
		this.responseId = responseId;
	}

	toString(): string {
		return `CSChatProgressId { responseId: "${this.responseId}" }`;
	}
}

export class CSChatFileTreeData implements vscode.FileTreeData {
	label: string;
	uri: vscode.Uri;
	children?: vscode.FileTreeData[] | undefined;

	constructor(label: string, uri: vscode.Uri, children?: vscode.FileTreeData[] | undefined) {
		this.label = label;
		this.uri = uri;
		this.children = children;
	}

	toString(): string {
		return `CSChatFileTreeData { label: "${this.label}", uri: "${this.uri}", children: ${JSON.stringify(this.children, null, 2)} }`;
	}
}

export class CSChatProgressFileTree implements vscode.InteractiveProgressFileTree {
	treeData: CSChatFileTreeData;

	constructor(treeData: CSChatFileTreeData) {
		this.treeData = treeData;
	}

	toString(): string {
		return `CSChatProgressFileTree { treeData: "${this.treeData}" }`;
	}
}

export class CSChatProgressTask implements vscode.InteractiveProgressTask {
	placeholder: string;
	resolvedContent: Thenable<CSChatProgressContent | CSChatProgressFileTree>;

	constructor(placeholder: string, resolvedContent: Thenable<CSChatProgressContent | CSChatProgressFileTree>) {
		this.placeholder = placeholder;
		this.resolvedContent = resolvedContent;
	}

	toString(): string {
		return `CSChatProgressTask { placeholder: "${this.placeholder}", resolvedContent: "${this.resolvedContent}" }`;
	}
}

export type CSChatProgress = CSChatProgressContent | CSChatProgressId | CSChatProgressTask | CSChatProgressFileTree;

class CSChatResponseForProgress implements vscode.InteractiveResponseForProgress {
	errorDetails?: CSChatResponseErrorDetails | undefined;

	constructor(errorDetails?: CSChatResponseErrorDetails | undefined) {
		this.errorDetails = errorDetails;
	}

	toString(): string {
		return `CSChatResponseForProgress { errorDetails: ${this.errorDetails?.toString()} }`;
	}
}

export class CSChatCancellationToken implements vscode.CancellationToken {
	isCancellationRequested: boolean;
	onCancellationRequested: vscode.Event<any>;

	constructor(isCancellationRequested: boolean, onCancellationRequested: vscode.Event<any>) {
		this.isCancellationRequested = isCancellationRequested;
		this.onCancellationRequested = onCancellationRequested;
	}

	toString(): string {
		return `CSChatCancellationToken { isCancellationRequested: "${this.isCancellationRequested}", onCancellationRequested: "${this.onCancellationRequested}" }`;
	}
}

export class CSChatProvider implements vscode.InteractiveSessionProvider {
	private _chatSessionState: CSChatSessionState;

	private _codeGraph: CodeGraph;
	private _codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection;
	private _workingDirectory: string;
	private _testSuiteRunCommand: string;
	private _activeFilesTracker: ActiveFilesTracker;
	private _repoName: string;
	private _repoHash: string;
	private _uniqueUserId: string;
	private _searchIndexCollection: SearchIndexCollection;
	private _agentCustomInformation: string | null;
	private _sideCarClient: SideCarClient;
	private _currentRepoRef: RepoRef;

	constructor(
		workingDirectory: string,
		codeGraph: CodeGraph,
		repoName: string,
		repoHash: string,
		searchIndexCollection: SearchIndexCollection,
		codeSymbolsLanguageCollection: CodeSymbolsLanguageCollection,
		testSuiteRunCommand: string,
		activeFilesTracker: ActiveFilesTracker,
		uniqueUserId: string,
		agentCustomInstruction: string | null,
		sideCarClient: SideCarClient,
		repoRef: RepoRef,
	) {
		this._workingDirectory = workingDirectory;
		this._codeGraph = codeGraph;
		this._chatSessionState = new CSChatSessionState(
			agentCustomInstruction,
		);
		this._repoHash = repoHash;
		this._repoName = repoName;
		this._codeSymbolsLanguageCollection = codeSymbolsLanguageCollection;
		this._testSuiteRunCommand = testSuiteRunCommand;
		this._activeFilesTracker = activeFilesTracker;
		this._uniqueUserId = uniqueUserId;
		this._searchIndexCollection = searchIndexCollection;
		this._agentCustomInformation = agentCustomInstruction;
		this._sideCarClient = sideCarClient;
		this._currentRepoRef = repoRef;
	}

	provideSlashCommands?(session: CSChatSession, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InteractiveSessionSlashCommand[]> {
		logger.info('provideSlashCommands', session);
		return [
			{
				command: 'help',
				kind: vscode.CompletionItemKind.Text,
				detail: 'Get help on how to use CodeStory',
				shouldRepopulate: true,
				followupPlaceholder: 'Ask me a question or type \'/\' for bb?',
				executeImmediately: false,
			},
			{
				command: 'agent',
				kind: vscode.CompletionItemKind.Text,
				detail: 'Invoke the CodeStory agent to do codebase wide changes',
				shouldRepopulate: true,
				executeImmediately: false,
			},
			{
				command: 'explain',
				kind: vscode.CompletionItemKind.Text,
				detail: 'Explain the code for the selection at a local and global level',
				shouldRepopulate: true,
				executeImmediately: false,
			},
			{
				command: 'general',
				kind: vscode.CompletionItemKind.Text,
				detail: 'Ask any kind of general questions to the AI with our without context',
				shouldRepopulate: true,
				executeImmediately: false,
			},
			{
				command: 'search',
				kind: vscode.CompletionItemKind.Text,
				detail: 'Search for the relevant code symbols from the codebase',
				shouldRepopulate: true,
				executeImmediately: false,
			},
		];
	}

	provideWelcomeMessage?(token: CSChatCancellationToken): vscode.ProviderResult<vscode.InteractiveWelcomeMessageContent[]> {
		logger.info('provideWelcomeMessage', token);
		return [
			'Hi, I\'m **Aide**, your personal AI assistant! I can write, debug, find, understand and explain code for you.',
			'Here are some things you can ask me to get started:',
			[
				new CSChatReplyFollowup(
					'/agent add comments to the entrypoint',
					'Add comments to the entrypoint',
					'Add comments to the entrypoint'
				),
				new CSChatReplyFollowup(
					'/explain the active file in the editor',
					'Explain the active file in the editor',
					'Explain the active file in the editor'
				),
				new CSChatReplyFollowup(
					'Where are the race conditions in the selected code?',
				),
			],
			'You can start your request with \'**`/`**\' to give me specific instructions and type \'**`@`**\' to find files and code symbols that I can use to narrow down the context of your request.',
			'I might make mistakes, though! Like we all do once in a while. If you find me doing so, please share your feedback via **[Discord](https://discord.gg/Cwg3vqgb)** or **founders@codestory.ai** so I can get better.',
		];
	}

	prepareSession(initialState: CSChatSessionState | undefined, token: CSChatCancellationToken): vscode.ProviderResult<CSChatSession> {
		logger.info('prepareSession', initialState, token);
		const iconUri = vscode.Uri.joinPath(
			vscode.extensions.getExtension('codestory-ghost.codestoryai')?.extensionUri ?? vscode.Uri.parse(''),
			'assets',
			'aide-white.svg'
		);
		return new CSChatSession(
			new CSChatParticipant('You'),
			new CSChatParticipant('Aide', iconUri),
			initialState,
			this._agentCustomInformation,
			'Ask away and use @ to give code, files to the AI',
		);
	}

	resolveRequest(session: CSChatSession, context: CSChatRequestArgs | string, token: CSChatCancellationToken): vscode.ProviderResult<CSChatRequest> {
		logger.info('resolveRequest', session, context, token);
		// Here there can be actions from the / commands or just normal string
		// followup, so we need to handle both of them separately
		session.chatSessionState.chatContext.addUserMessage(context.toString());
		logger.info(`[codestory][message_length][resolveRequest] ${this._chatSessionState.chatContext.getMessageLength()}`);
		return new CSChatRequest(session, context.toString());
	}

	provideResponseWithProgress(request: CSChatRequest, progress: vscode.Progress<CSChatProgress>, token: CSChatCancellationToken): vscode.ProviderResult<CSChatResponseForProgress> {
		logger.info('provideResponseWithProgress', request, progress, token);
		console.log('[cs-chat][provideResponseWithProgress]', request);
		return (async () => {
			// export type UserMessageType = 'explain' | 'general' | 'instruction' | 'search' | 'help';
			const deterministicRequestType = deterministicClassifier(request.message.toString());
			const requestType = deterministicRequestType ?? await promptClassifier(request.message.toString());
			const userProvidedContext = request.userProvidedContext ? getContextForPromptFromUserContext(request.userProvidedContext) : null;
			logger.info(`[codestory][request_type][provideResponseWithProgress] ${requestType}`);
			if (requestType === 'help') {
				progress.report(new CSChatProgressContent(
					`Here are some helpful docs for resolving the most common issues: [Code Story](https://docs.codestory.ai)\n`
				));
				return new CSChatResponseForProgress();
			} else if (requestType === 'instruction') {
				const prompt = request.message.toString().slice(7).trim();
				if (prompt.length === 0) {
					return new CSChatResponseForProgress(new CSChatResponseErrorDetails('Please provide a prompt for the agent to work on'));
				}

				const toolingEventCollection = new ToolingEventCollection(
					`/tmp/${uuidv4()}`,
					{ progress, cancellationToken: token },
					prompt,
				);

				const uniqueId = uuidv4();
				await debuggingFlow(
					prompt,
					toolingEventCollection,
					this._searchIndexCollection,
					this._codeSymbolsLanguageCollection,
					this._workingDirectory,
					this._testSuiteRunCommand,
					this._activeFilesTracker,
					request.userProvidedContext,
					uniqueId,
					this._agentCustomInformation,
				);
				return new CSChatResponseForProgress();
			} else if (requestType === 'explain') {
				// Implement the explain feature here
				const relevantContext = getRelevantContextForCodeSelection(this._codeGraph);

				return (async () => {
					if (relevantContext) {
						const contextForPrompt = createContextPrompt(relevantContext);
						// We add the code context here for generating the response
						this._chatSessionState.chatContext.addExplainCodeContext(contextForPrompt);
					}
					if (userProvidedContext) {
						console.log(`[explain][userProvidedContext] ${userProvidedContext}`);
						this._chatSessionState.chatContext.addExplainCodeContext(userProvidedContext);
					}
					this._chatSessionState.chatContext.addUserMessage(
						'Remember to be concise and explain the code like a professor in computer science, use the references provided to quote how its used in the codebase. Don\'t ask me what the issue is, you need to explain the code context I provided to you.'
					);
					console.log(`[explain][messages] ${this._chatSessionState.chatContext.getMessages()}`);
					console.log(this._chatSessionState.chatContext.getMessages());
					const streamingResponse = generateChatCompletion(
						this._chatSessionState.chatContext.getMessages(),
					);
					// Remove the message here too
					this._chatSessionState.chatContext.removeLastMessage();
					const finalMessage = await reportFromStreamToProgress(streamingResponse, progress, token);
					this._chatSessionState.chatContext.addCodeStoryMessage(finalMessage);
					return new CSChatResponseForProgress();
				})();
			} else if (requestType === 'search') {
				logSearchPrompt(
					request.message.toString(),
					this._repoName,
					this._repoHash,
					this._uniqueUserId,
				);
				const searchString = request.message.toString().slice('/search'.length).trim();
				const searchResponse = await this._sideCarClient.searchQuery(searchString, this._currentRepoRef);
				// TODO(skcd): Debug this properly, and check if the responses look good
				await reportFromStreamToSearchProgress(searchResponse, progress, token, this._currentRepoRef, this._workingDirectory);
				// We get back here a bunch of responses which we have to pass properly to the agent
				return new CSChatResponseForProgress();
			} else {
				const selectionContext = getSelectedCodeContext(this._workingDirectory);
				this._chatSessionState.chatContext.cleanupChatHistory();
				this._chatSessionState.chatContext.addUserMessage(request.message.toString());
				logChatPrompt(
					request.message.toString(),
					this._repoName,
					this._repoHash,
					this._uniqueUserId,
				);
				if (selectionContext) {
					this._chatSessionState.chatContext.addCodeContext(
						selectionContext.selectedText,
						selectionContext.extraSurroundingText,
					);
				}
				if (userProvidedContext) {
					this._chatSessionState.chatContext.addExplainCodeContext(
						userProvidedContext,
					);
				}
				const streamingResponse = generateChatCompletion(
					this._chatSessionState.chatContext.getMessages(),
				);
				const finalMessage = await reportFromStreamToProgress(streamingResponse, progress, token);
				this._chatSessionState.chatContext.addCodeStoryMessage(finalMessage);
				return new CSChatResponseForProgress();
			}
		})();
	}

	removeRequest(session: CSChatSession, requestId: string) {
		logger.info('removeRequest', session, requestId);
		// Do nothing
	}
}
