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
import { logChatPrompt } from '../posthog/logChatPrompt';
import { reportFromStreamToProgress } from '../chatState/convertStreamToMessage';
import { CodeGraph } from '../codeGraph/graph';
import { createContextPrompt, getRelevantContextForCodeSelection } from '../chatState/getContextForCodeSelection';
import { EmbeddingsSearch } from '../codeGraph/embeddingsSearch';
import { TSMorphProjectManagement } from '../utilities/parseTypescript';
import { PythonServer } from '../utilities/pythonServerClient';
import { debuggingFlow } from '../llm/recipe/debugging';
import { ToolingEventCollection } from '../timeline/events/collection';
import { GoLangParser } from '../languages/goCodeSymbols';
import { ActiveFilesTracker } from '../activeChanges/activeFilesTracker';
import { deterministicClassifier, promptClassifier } from '../chatState/promptClassifier';

class CSChatSessionState implements vscode.InteractiveSessionState {
	public chatContext: CSChatState;

	constructor() {
		this.chatContext = new CSChatState();
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
	public chatSessionState: CSChatSessionState;

	saveState(): CSChatSessionState {
		logger.info('Saving state' + this.toString());
		return this.chatSessionState;
	}

	constructor(requester: CSChatParticipant, responder: CSChatParticipant, initialState: CSChatSessionState | undefined, inputPlaceholder?: string | undefined) {
		this.requester = requester;
		this.responder = responder;
		this.inputPlaceholder = inputPlaceholder;
		this.chatSessionState = initialState ?? new CSChatSessionState();
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
	private _embeddingsIndex: EmbeddingsSearch;
	private _projectManagement: TSMorphProjectManagement;
	private _pythonServer: PythonServer;
	private _golangParser: GoLangParser;
	private _workingDirectory: string;
	private _testSuiteRunCommand: string;
	private _activeFilesTracker: ActiveFilesTracker;
	private _repoName: string;
	private _repoHash: string;

	constructor(
		workingDirectory: string,
		codeGraph: CodeGraph,
		repoName: string,
		repoHash: string,
		embeddingsIndex: EmbeddingsSearch,
		projectManagement: TSMorphProjectManagement,
		pythonServer: PythonServer,
		golangParser: GoLangParser,
		testSuiteRunCommand: string,
		activeFilesTracker: ActiveFilesTracker,
	) {
		this._workingDirectory = workingDirectory;
		this._codeGraph = codeGraph;
		this._chatSessionState = new CSChatSessionState();
		this._repoHash = repoHash;
		this._repoName = repoName;
		this._embeddingsIndex = embeddingsIndex;
		this._projectManagement = projectManagement;
		this._pythonServer = pythonServer;
		this._golangParser = golangParser;
		this._testSuiteRunCommand = testSuiteRunCommand;
		this._activeFilesTracker = activeFilesTracker;
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
			'Hi! How can I help you?',
			'Ask CodeStory a question or type \'/\' for topics? I am powered by AI so I might make mistakes, please provide feedback to my developers at founders@codestory.ai or on [discord](https://discord.gg/Cwg3vqgb)',
		];
	}

	prepareSession(initialState: CSChatSessionState | undefined, token: CSChatCancellationToken): vscode.ProviderResult<CSChatSession> {
		logger.info('prepareSession', initialState, token);
		return new CSChatSession(
			new CSChatParticipant('You'),
			new CSChatParticipant('CodeStory'),
			initialState,
			'Ask CodeStory a question or type \'/\' for topics?'
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
		return (async () => {
			// export type UserMessageType = 'explain' | 'general' | 'instruction' | 'search' | 'help';
			const deterministicRequestType = deterministicClassifier(request.message.toString());
			const requestType = deterministicRequestType ?? await promptClassifier(request.message.toString());
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
					this._codeGraph,
					undefined,
					{ progress, cancellationToken: token },
					prompt,
				);

				const uniqueId = uuidv4();
				await debuggingFlow(
					prompt,
					toolingEventCollection,
					this._codeGraph,
					this._embeddingsIndex,
					this._projectManagement,
					this._pythonServer,
					this._golangParser,
					this._workingDirectory,
					this._testSuiteRunCommand,
					this._activeFilesTracker,
					uniqueId
				);
				return new CSChatResponseForProgress();
			} else if (requestType === 'explain') {
				// Implement the explain feature here
				const relevantContext = getRelevantContextForCodeSelection(this._codeGraph);
				if (relevantContext === null) {
					progress.report(new CSChatProgressContent(
						`There is no relevant context to explain the code\n`
					));
					return new CSChatResponseForProgress();
				}

				return (async () => {
					const contextForPrompt = createContextPrompt(relevantContext);
					// We add the code context here for generating the response
					this._chatSessionState.chatContext.addExplainCodeContext(contextForPrompt);
					const streamingResponse = generateChatCompletion(
						this._chatSessionState.chatContext.getMessages(),
					);
					const finalMessage = await reportFromStreamToProgress(streamingResponse, progress, token);
					this._chatSessionState.chatContext.addCodeStoryMessage(finalMessage);
					return new CSChatResponseForProgress();
				})();
			} else if (requestType === 'search') {
				progress.report(new CSChatProgressContent(
					// allow-any-unicode-next-line
					'Under construction 🏗️, use the semantic search feature in the normal search bar instead. devs@codestory.ai will push updates here'
				));
				return new CSChatResponseForProgress();
			} else {
				const selectionContext = getSelectedCodeContext(this._workingDirectory);
				this._chatSessionState.chatContext.cleanupChatHistory();
				this._chatSessionState.chatContext.addUserMessage(request.message.toString());
				logChatPrompt(
					request.message.toString(),
					this._repoName,
					this._repoHash,
				);
				if (selectionContext) {
					this._chatSessionState.chatContext.addCodeContext(
						selectionContext.selectedText,
						selectionContext.extraSurroundingText,
					);
					const streamingResponse = generateChatCompletion(
						this._chatSessionState.chatContext.getMessages(),
					);
					const finalMessage = await reportFromStreamToProgress(streamingResponse, progress, token);
					this._chatSessionState.chatContext.addCodeStoryMessage(finalMessage);
					return new CSChatResponseForProgress();
				} else {
					const streamingResponse = generateChatCompletion(
						this._chatSessionState.chatContext.getMessages(),
					);
					const finalMessage = await reportFromStreamToProgress(streamingResponse, progress, token);
					this._chatSessionState.chatContext.addCodeStoryMessage(finalMessage);
					return new CSChatResponseForProgress();
				}
			}
		})();
	}

	removeRequest(session: CSChatSession, requestId: string) {
		logger.info('removeRequest', session, requestId);
		// Do nothing
	}
}
