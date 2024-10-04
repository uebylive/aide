/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { sidecarTypeDefinitionsWithNode } from '../completions/helpers/vscodeApi';
import { LoggingService } from '../completions/logger';
import { OPEN_FILES_VARIABLE } from '../completions/providers/openFiles';
import { StreamCompletionResponse, StreamCompletionResponseUpdates } from '../completions/providers/fetch-and-process-completions';
import { TERMINAL_SELECTION_VARIABLE } from '../completions/providers/terminalSelection';
import { CompletionRequest, CompletionResponse } from '../inlineCompletion/sidecarCompletion';
import { SelectionDataForExplain } from '../utilities/getSelectionContext';
import { sidecarNotIndexRepository } from '../utilities/sidecarUrl';
import { sleep } from '../utilities/sleep';
import { readCustomSystemInstruction } from '../utilities/systemInstruction';
import { CodeSymbolInformationEmbeddings, CodeSymbolKind } from '../utilities/types';
import { getUserId } from '../utilities/uniqueId';
import { callServerEventStreamingBufferedGET, callServerEventStreamingBufferedPOST } from './ssestream';
import { ConversationMessage, EditFileResponse, getSideCarModelConfiguration, IdentifierNodeType, InEditorRequest, InEditorTreeSitterDocumentationQuery, InEditorTreeSitterDocumentationReply, InLineAgentMessage, Position, RepoStatus, SemanticSearchResponse, SidecarVariableType, SidecarVariableTypes, SnippetInformation, SyncUpdate, TextDocument } from './types';
import { CodeEditAgentBody, ProbeAgentBody, SideCarAgentEvent, SidecarContextEvent, UserContext } from '../server/types';
import { Diagnostic } from 'vscode';
import { GENERATE_PLAN } from '../completions/providers/generatePlan';
import { AideProbeProvider } from '../completions/providers/probeProvider';
import { AidePlanTimer } from '../utilities/planTimer';

export enum CompletionStopReason {
	/**
	 * Used to signal to the completion processing code that we're still streaming.
	 * Can be removed if we make `CompletionResponse.stopReason` optional. Then
	 * `{ stopReason: undefined }` can be used instead.
	 */
	StreamingChunk = 'aide-streaming-chunk',
	RequestAborted = 'aide-request-aborted',
	RequestFinished = 'aide-request-finished',
}

export enum RepoRefBackend {
	local = 'local',
	github = 'github',
}


export class RepoRef {
	private _path: string;
	private _backend: RepoRefBackend;

	constructor(
		path: string,
		backend: RepoRefBackend
	) {
		this._path = path;
		this._backend = backend;
	}

	getRepresentation(): string {
		return `${this._backend}/${this._path}`;
	}

	getPath(): string {
		return this._path;
	}
}


export class SideCarClient {
	private _url: string;
	private _modelConfiguration: vscode.ModelSelection;
	private _userId: string | null;

	constructor(
		url: string,
		modelConfiguration: vscode.ModelSelection,
	) {
		this._url = url;
		this._modelConfiguration = modelConfiguration;
		this._userId = getUserId();
	}

	updateModelConfiguration(modelConfiguration: vscode.ModelSelection) {
		this._modelConfiguration = modelConfiguration;
		console.log('updated model configuration', this._modelConfiguration);
	}

	getRepoListUrl(): string {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/repo/repo_list';
		return baseUrl.toString();
	}

	async getRangeForDiagnostics(
		textDocumentWeb: TextDocument,
		snippetInformation: SnippetInformation,
		thresholdToExpand: number,
	) {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/tree_sitter/diagnostic_parsing';
		const body = {
			text_document_web: textDocumentWeb,
			range: snippetInformation,
			threshold_to_expand: thresholdToExpand,
		};
		const url = baseUrl.toString();
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		const responseJson = await response.json();
		console.log(responseJson);
	}

	async getRepoStatus(): Promise<RepoStatus> {
		const response = await fetch(this.getRepoListUrl());
		const repoList = (await response.json()) as RepoStatus;
		return repoList;
	}


	async *getRepoSyncStatus(): AsyncIterableIterator<SyncUpdate> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/repo/status';
		const url = baseUrl.toString();
		const asyncIterableResponse = await callServerEventStreamingBufferedGET(url);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const finalString = '{' + lineSinglePartTrimmed;
				const syncUpdate = JSON.parse(finalString) as SyncUpdate;
				yield syncUpdate;
			}
		}
	}


	async *getInLineEditorResponse(
		context: InEditorRequest,
	): AsyncIterableIterator<InLineAgentMessage> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/in_editor/answer';
		const url = baseUrl.toString();
		const sideCarModelConfiguration = await getSideCarModelConfiguration(await vscode.modelSelection.getConfiguration());
		const finalContext = {
			...context,
			modelConfig: sideCarModelConfiguration,
			userId: this._userId,
		};
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, finalContext);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const inlineAgentMessage = JSON.parse('{' + lineSinglePartTrimmed) as InLineAgentMessage;
				yield inlineAgentMessage;
			}
		}
	}

	async getParsedComments(
		context: InEditorTreeSitterDocumentationQuery,
	): Promise<InEditorTreeSitterDocumentationReply> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/tree_sitter/documentation_parsing';
		const url = baseUrl.toString();
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(context),
		});
		const responseJson = await response.json();
		return responseJson as InEditorTreeSitterDocumentationReply;
	}

	async *editFileRequest(
		filePath: string,
		fileContent: string,
		language: string,
		llmContent: string,
		userQuery: string,
		codeBlockIndex: number,
		sessionId: string,
	): AsyncIterableIterator<EditFileResponse> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/file/edit_file';
		const url = baseUrl.toString();
		const sideCarModelConfiguration = await getSideCarModelConfiguration(await vscode.modelSelection.getConfiguration());
		const body = {
			file_path: filePath,
			file_content: fileContent,
			language: language,
			new_content: llmContent,
			user_query: userQuery,
			session_id: sessionId,
			code_block_index: codeBlockIndex,
			userId: this._userId,
			model_config: sideCarModelConfiguration,
		};
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const editFileResponse = JSON.parse('{' + lineSinglePartTrimmed) as EditFileResponse;
				yield editFileResponse;
			}
		}
	}

	async *followupQuestion(
		query: string,
		repoRef: RepoRef,
		threadId: string,
		variables: readonly vscode.ChatPromptReference[],
		projectLabels: string[],
		probeProvider: AideProbeProvider,
		aidePlanTimer: AidePlanTimer,
	): AsyncIterableIterator<ConversationMessage> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agent/followup_chat';
		const url = baseUrl.toString();
		const activeWindowData = getCurrentActiveWindow();
		const sideCarModelConfiguration = await getSideCarModelConfiguration(await vscode.modelSelection.getConfiguration());
		const userContext = await convertVSCodeVariableToSidecarHackingForPlan(variables, query);
		// starts the plan timer at this point if we are at plan generation step
		if (userContext.is_plan_generation) {
			aidePlanTimer.startPlanTimer();
		}
		const codestoryConfiguration = vscode.workspace.getConfiguration('aide');
		const deepReasoning = codestoryConfiguration.get('deepReasoning') as boolean;
		const agentSystemInstruction = readCustomSystemInstruction();
		const body = {
			repo_ref: repoRef.getRepresentation(),
			query: query,
			thread_id: threadId,
			user_context: await convertVSCodeVariableToSidecarHackingForPlan(variables, query),
			project_labels: projectLabels,
			active_window_data: activeWindowData,
			model_config: sideCarModelConfiguration,
			user_id: this._userId,
			system_instruction: agentSystemInstruction,
			editor_url: probeProvider.editorUrl(),
			is_deep_reasoning: deepReasoning,
		};
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				// console.log('string parts');
				// console.log(lineSinglePartTrimmed);
				const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as ConversationMessage;
				yield conversationMessage;
			}
		}
	}

	async *explainQuery(
		query: string,
		repoRef: RepoRef,
		selection: SelectionDataForExplain,
		threadId: string,
	): AsyncIterableIterator<ConversationMessage> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agent/explain';
		baseUrl.searchParams.set('repo_ref', repoRef.getRepresentation());
		baseUrl.searchParams.set('query', query);
		baseUrl.searchParams.set('start_line', selection.lineStart.toString());
		baseUrl.searchParams.set('end_line', selection.lineEnd.toString());
		baseUrl.searchParams.set('relative_path', selection.relativeFilePath);
		baseUrl.searchParams.set('thread_id', threadId);
		const url = baseUrl.toString();
		const asyncIterableResponse = await callServerEventStreamingBufferedGET(url);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as ConversationMessage;
				yield conversationMessage;
			}
		}
	}

	async *searchQuery(
		query: string,
		repoRef: RepoRef,
		threadId: string,
	): AsyncIterableIterator<ConversationMessage> {
		// how do we create the url properly here?
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agent/search_agent';
		baseUrl.searchParams.set('reporef', repoRef.getRepresentation());
		baseUrl.searchParams.set('query', query);
		baseUrl.searchParams.set('thread_id', threadId);
		const url = baseUrl.toString();
		const asyncIterableResponse = await callServerEventStreamingBufferedGET(url);
		for await (const line of asyncIterableResponse) {
			// Now these responses can be parsed properly, since we are using our
			// own reader over sse, sometimes the reader might send multiple events
			// in a single line so we should split the lines by \n to get the
			// individual lines
			// console.log(line);
			// Is this a good placeholder? probably not, cause we can have instances
			// of this inside the string too, but for now lets check if this works as
			// want it to
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as ConversationMessage;
				// console.log('[search][stream] whats the message from the stream');
				yield conversationMessage;
			}
		}
	}

	async cancelInlineCompletion(
		requestId: string,
	): Promise<null> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/inline_completion/cancel_inline_completion';
		const body = {
			id: requestId,
		};
		const url = baseUrl.toString();
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		return null;
	}

	async *inlineCompletionTextNewLine(
		completionRequest: CompletionRequest,
		signal: AbortSignal,
		logger: LoggingService,
		spanId: string,
		startTime: number,
	): AsyncIterable<StreamCompletionResponseUpdates> {
		const baseUrl = new URL(this._url);
		const sideCarModelConfiguration = await getSideCarModelConfiguration(
			await vscode.modelSelection.getConfiguration()
		);
		// console.log('sidecar.model_configuration');
		// console.log(JSON.stringify(sideCarModelConfiguration));
		baseUrl.pathname = '/api/inline_completion/inline_completion';

		const body = {
			filepath: completionRequest.filepath,
			language: completionRequest.language,
			text: completionRequest.text,
			// The cursor position in the editor
			position: {
				line: completionRequest.position.line,
				character: completionRequest.position.character,
				byteOffset: completionRequest.position.byteOffset,
			},
			model_config: sideCarModelConfiguration,
			id: completionRequest.id,
			clipboard_content: completionRequest.clipboard,
			type_identifiers: sidecarTypeDefinitionsWithNode(completionRequest.identifierNodes),
			user_id: this._userId,
		};
		const url = baseUrl.toString();
		let finalAnswer = '';

		// Set the combinedSignal as the signal option in the fetch request
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		let bufferedAnswer = '';
		let runningPreviousLines = '';
		let isNewLineStart = false;
		for await (const line of asyncIterableResponse) {
			if (signal.aborted) {
				return {
					completion: finalAnswer,
					stopReason: CompletionStopReason.RequestAborted,
				};
			}
			const lineParts = line.split('data:"{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const finalString = '{' + lineSinglePartTrimmed.slice(0, -1);
				const editFileResponse = JSON.parse(JSON.parse(`"${finalString}"`)) as CompletionResponse;
				// take the first provided completion here
				if (editFileResponse.completions.length > 0) {
					finalAnswer = editFileResponse.completions[0].insertText;
					// there are some terminating conditions here cause we only want to yield on new lines
					// the completion might start with \n if its at the end of a line
					// or it might start with blah ... \n
					// we have to yield only when we have a new complete line which will be useful
					const delta = editFileResponse.completions[0].delta;
					if (delta === null || delta === undefined) {
						// if its empty then we should always return it ASAP, since its the end of this completion
						logger.logInfo('sidecar.inline_completion.streaming', {
							'event_name': 'sidecar.inline_completion.streaming.no_delta',
							'completion': finalAnswer,
							'time_taken': performance.now() - startTime,
							'id': spanId,
							'stop_reason': CompletionStopReason.RequestFinished,
						});
						yield {
							completion: finalAnswer,
							stopReason: CompletionStopReason.RequestFinished,
							delta: null,
						};
						return;
					}

					// we want to keep the following things in order
					// - what new lines have we sent before
					// - merge the current line with the previously sent new lines
					// - send the whole answer when we finish streaming
					if (delta && delta === '\n' && finalAnswer === '') {
						// start of an empty line, so we handle it here
						isNewLineStart = true;
						continue;
					} else {
						bufferedAnswer = bufferedAnswer + delta;
						// find the index of \n here
						// else we have a new line! so we can split the string at that position and keep the rest and keep repeating
						while (true) {
							const indexOfNewLine = bufferedAnswer.indexOf('\n');
							if (indexOfNewLine === -1) {
								break;
							}
							const completeLine = bufferedAnswer.substring(0, indexOfNewLine);
							// if we are going to start with a new line, then we need to have \n as the prefix
							const prefix = isNewLineStart ? '\n' : '';
							// if the previous lines are there then we join it with \n else we just join with ''
							const joinString = runningPreviousLines === '' ? '' : '\n';
							const finalCompletion = prefix + runningPreviousLines + joinString + completeLine;
							logger.logInfo('sidecar.inline_completion.streaming', {
								'event_name': 'sidecar.inline_completion.streaming',
								'completion': finalCompletion,
								'startTime': startTime,
								'now': performance.now(),
								'time_taken': performance.now() - startTime,
								'id': spanId,
								'stop_reason': CompletionStopReason.StreamingChunk,
							});
							yield {
								completion: finalCompletion,
								stopReason: CompletionStopReason.StreamingChunk,
								delta: null,
							};
							// here we update our previous running lines
							if (runningPreviousLines === '') {
								runningPreviousLines = completeLine;
							} else {
								runningPreviousLines = runningPreviousLines + '\n' + completeLine;
							}
							// now move the buffered answer to after the position of the newline
							bufferedAnswer = bufferedAnswer.substring(indexOfNewLine + 1);
						}
					}
				}
			}
		}
		yield {
			completion: finalAnswer,
			delta: null,
			stopReason: CompletionStopReason.StreamingChunk,
		};
	}

	async *inlineCompletionText(
		completionRequest: CompletionRequest,
		signal: AbortSignal,
	): AsyncIterable<StreamCompletionResponse> {
		const baseUrl = new URL(this._url);
		const sideCarModelConfiguration = await getSideCarModelConfiguration(
			await vscode.modelSelection.getConfiguration()
		);
		baseUrl.pathname = '/api/inline_completion/inline_completion';

		const body = {
			filepath: completionRequest.filepath,
			language: completionRequest.language,
			text: completionRequest.text,
			// The cursor position in the editor
			position: {
				line: completionRequest.position.line,
				character: completionRequest.position.character,
				byteOffset: completionRequest.position.byteOffset,
			},
			model_config: sideCarModelConfiguration,
			id: completionRequest.id,
		};
		const url = baseUrl.toString();
		let finalAnswer = '';

		// Set the combinedSignal as the signal option in the fetch request
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			if (signal.aborted) {
				return {
					completion: finalAnswer,
					stopReason: CompletionStopReason.RequestAborted,
				};
			}
			const lineParts = line.split('data:"{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const finalString = '{' + lineSinglePartTrimmed.slice(0, -1);
				const editFileResponse = JSON.parse(JSON.parse(`"${finalString}"`)) as CompletionResponse;
				// take the first provided completion here
				if (editFileResponse.completions.length > 0) {
					finalAnswer = editFileResponse.completions[0].insertText;
					yield {
						completion: finalAnswer,
						stopReason: CompletionStopReason.StreamingChunk,
					};
				}
			}
		}

		yield {
			completion: finalAnswer,
			stopReason: CompletionStopReason.RequestFinished,
		};
	}

	async getIdentifierNodes(
		filePath: string,
		fileContent: string,
		language: string,
		cursorLine: number,
		cursorColumn: number,
	): Promise<IdentifierNodeType> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/inline_completion/get_identifier_nodes';
		const body = {
			file_path: filePath,
			file_content: fileContent,
			language,
			cursor_line: cursorLine,
			cursor_column: cursorColumn,
		};
		const url = baseUrl.toString();
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json',
			},
		});
		const finalResponse = await response.json() as IdentifierNodeType;
		return finalResponse;
	}

	async documentContentChange(
		filePath: string,
		events: readonly vscode.TextDocumentContentChangeEvent[],
		fileContent: string,
		language: string,
	): Promise<void> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/inline_completion/document_content_changed';
		const mappedEvents = events.map((event) => {
			return {
				range: {
					start_line: event.range.start.line,
					start_column: event.range.start.character,
					end_line: event.range.end.line,
					end_column: event.range.end.character,
				},
				text: event.text,
			};
		});
		const body = {
			file_path: filePath,
			file_content: fileContent,
			language,
			events: mappedEvents,
		};
		const url = baseUrl.toString();
		await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	async documentOpen(
		filePath: string,
		fileContent: string,
		language: string,
	): Promise<void> {
		// There might be files which have a .git extension we should not be sending
		// those to the sidecar
		if (filePath.endsWith('.git')) {
			return;
		}
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/inline_completion/document_open';
		const body = {
			file_path: filePath,
			file_content: fileContent,
			language,
		};
		const url = baseUrl.toString();
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json',
			},
		});
		if (!response.ok) {
			throw new Error(`Error while opening file: ${response.statusText}`);
		}
	}

	async sendDiagnostics(
		filePath: string,
		diagnostics: readonly Diagnostic[]
	): Promise<void> {
		const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/diagnostics';  // New invented endpoint

		const body = {
			fs_file_path: filePath,
			diagnostics: diagnostics.map(diag => ({
				severity: diag.severity,
				message: diag.message,
				range: {
					start_position: { line: diag.range.start.line, character: diag.range.start.character, byte_offset: 0 },
					end_position: { line: diag.range.end.line, character: diag.range.end.character, byte_offset: 0 }
				},
				code: diag.code,
				source: diag.source,
				range_content: textDocument.getText(diag.range),
			}))
		};

		const url = baseUrl.toString();
		const response = await fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			// throw new Error(`Error while sending diagnostics: ${response.statusText}`);
		}
	}

	async * inlineCompletion(
		completionRequest: CompletionRequest,
		_signal: AbortSignal,
	): AsyncIterable<CompletionResponse> {
		const baseUrl = new URL(this._url);
		const sideCarModelConfiguration = await getSideCarModelConfiguration(
			await vscode.modelSelection.getConfiguration()
		);
		baseUrl.pathname = '/api/inline_completion/inline_completion';

		const body = {
			filepath: completionRequest.filepath,
			language: completionRequest.language,
			text: completionRequest.text,
			// The cursor position in the editor
			position: {
				line: completionRequest.position.line,
				character: completionRequest.position.character,
				byteOffset: completionRequest.position.byteOffset,
			},
			model_config: sideCarModelConfiguration,
			id: completionRequest.id,
		};
		const url = baseUrl.toString();

		// Set the combinedSignal as the signal option in the fetch request
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:"{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const finalString = '{' + lineSinglePartTrimmed.slice(0, -1);
				const editFileResponse = JSON.parse(JSON.parse(`"${finalString}"`)) as CompletionResponse;
				yield editFileResponse;
			}
		}
	}


	async indexRepositoryIfNotInvoked(repoRef: RepoRef): Promise<boolean> {
		// First get the list of indexed repositories
		// log repo ref
		await this.waitForGreenHC();
		// console.log('fetching the status of the various repositories');
		const response = await fetch(this.getRepoListUrl());
		const repoList = (await response.json()) as RepoStatus;
		if (sidecarNotIndexRepository()) {
			return true;
		}
		if (!(repoRef.getRepresentation() in repoList.repo_map)) {
			// We need to index this repository
			const baseUrl = new URL(this._url);
			baseUrl.pathname = '/api/repo/sync';
			baseUrl.searchParams.set('repo', repoRef.getRepresentation());
			const url = baseUrl.toString();
			const response = await fetch(url);
			const responseJson = await response.json();
			return responseJson.status === 'ok';
		} else {
			// We don't need to index this repository
			return true;
		}
	}

	async waitForGreenHC(): Promise<boolean> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/health';
		let attempts = 0;
		const totalAttempts = 10;
		while (true) {
			try {
				// console.log('trying to HC for repo check');
				const url = baseUrl.toString();
				const response = await fetch(url);
				return response.status === 200;
			} catch (e) {
				// sleeping for a attempts * second here
				await sleep(1000 * (attempts + 1));
				attempts = attempts + 1;
				if (attempts < totalAttempts) {
					continue;
				} else {
					throw e;
				}
			}
		}
	}

	async getSemanticSearchResult(
		query: string,
		reporef: RepoRef,
	): Promise<CodeSymbolInformationEmbeddings[]> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agent/hybrid_search';
		baseUrl.searchParams.set('repo', reporef.getRepresentation());
		baseUrl.searchParams.set('query', query);
		const url = baseUrl.toString();
		const response = await fetch(url);
		const responseJson = await response.json();
		const semanticSearchResult = responseJson as SemanticSearchResponse;
		const codeSymbols = semanticSearchResult.code_spans;
		const sortedCodeSymbols = codeSymbols.sort((a, b) => {
			if (b.score !== null && a.score !== null) {
				return b.score - a.score;
			}
			if (b.score !== null && a.score === null) {
				return 1;
			}
			if (b.score === null && a.score !== null) {
				return -1;
			}
			return 0;
		});
		const codeSymbolInformationEmbeddings: CodeSymbolInformationEmbeddings[] = sortedCodeSymbols.map((codeSpan) => {
			const filePath = path.join(reporef.getPath(), codeSpan.file_path);
			return {
				codeSymbolInformation: {
					symbolName: '',
					symbolKind: CodeSymbolKind.null,
					symbolStartLine: codeSpan.start_line,
					symbolEndLine: codeSpan.end_line,
					codeSnippet: {
						languageId: 'typescript',
						code: codeSpan.data,
					},
					extraSymbolHint: null,
					dependencies: [],
					fsFilePath: filePath,
					originalFilePath: filePath,
					workingDirectory: reporef.getPath(),
					displayName: '',
					originalName: '',
					originalSymbolName: '',
					globalScope: 'global',
				},
				codeSymbolEmbedding: [],
				fileHash: '',
			};
		});
		return codeSymbolInformationEmbeddings;
	}

	async stopAgentProbe(threadId: string): Promise<void> {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/probe_request_stop';
		const url = baseUrl.toString();
		const body = {
			request_id: threadId,
		};
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	}

	async *startAgentProbe(
		query: string,
		variables: readonly vscode.ChatPromptReference[],
		editorUrl: string,
		threadId: string,
	): AsyncIterableIterator<SideCarAgentEvent> {
		// console.log('starting agent probe');
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/probe_request';
		const url = baseUrl.toString();
		const activeWindowData = getCurrentActiveWindow();
		let activeWindowDataForProbing = undefined;
		if (activeWindowData !== undefined) {
			activeWindowDataForProbing = {
				file_path: activeWindowData.file_path,
				file_content: activeWindowData.file_content,
				language: activeWindowData.language,
			};
		}
		const sideCarModelConfiguration = await getSideCarModelConfiguration(await vscode.modelSelection.getConfiguration());
		const body: ProbeAgentBody = {
			query,
			editor_url: editorUrl,
			request_id: threadId,
			model_config: sideCarModelConfiguration,
			user_context: await convertVSCodeVariableToSidecar(variables),
			active_window_data: activeWindowDataForProbing,
		};
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as SideCarAgentEvent;
				yield conversationMessage;
			}
		}
	}

	async codeSculptingFollowups(
		request_id: string,
		root_directory: string,
	) {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/code_sculpting_heal';
		const url = baseUrl.toString();
		const body = {
			request_id,
			root_directory,
		};
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	}

	async warmupCodeSculptingCache(
		file_paths: string[],
		editorUrl: string,
	) {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/code_sculpting_warmup';
		const url = baseUrl.toString();
		const body = {
			file_paths,
			editor_url: editorUrl,
			grab_import_nodes: false,
		};
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	}

	async codeSculptingFollowup(
		instruction: string,
		request_id: string,
	) {
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/code_sculpting_followup';
		const url = baseUrl.toString();
		const body = {
			request_id,
			instruction,
		};
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	}

	async *startAgentCodeEdit(
		query: string,
		variables: readonly vscode.ChatPromptReference[],
		editorUrl: string,
		threadId: string,
		codebaseSearch: boolean,
		isAnchorEditing: boolean,
	): AsyncIterableIterator<SideCarAgentEvent> {
		// console.log('starting agent code edit');
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/code_editing';
		const url = baseUrl.toString();
		const activeWindowData = getCurrentActiveWindow();
		let activeWindowDataForProbing = undefined;
		if (activeWindowData !== undefined) {
			activeWindowDataForProbing = {
				file_path: activeWindowData.file_path,
				file_content: activeWindowData.file_content,
				language: activeWindowData.language,
			};
		}
		const codestoryConfiguration = vscode.workspace.getConfiguration('aide');
		const deepReasoning = codestoryConfiguration.get('deepReasoning') as boolean;
		const body: CodeEditAgentBody = {
			user_query: query,
			editor_url: editorUrl,
			request_id: threadId,
			user_context: await convertVSCodeVariableToSidecar(variables),
			active_window_data: activeWindowDataForProbing,
			root_directory: vscode.workspace.rootPath,
			codebase_search: codebaseSearch,
			anchor_editing: isAnchorEditing,
			enable_import_nodes: false,
			deep_reasoning: deepReasoning,
		};
		const asyncIterableResponse = await callServerEventStreamingBufferedPOST(url, body);
		for await (const line of asyncIterableResponse) {
			const lineParts = line.split('data:{');
			for (const lineSinglePart of lineParts) {
				const lineSinglePartTrimmed = lineSinglePart.trim();
				if (lineSinglePartTrimmed === '') {
					continue;
				}
				const conversationMessage = JSON.parse('{' + lineSinglePartTrimmed) as SideCarAgentEvent;
				yield conversationMessage;
			}
		}
	}

	async sendContextRecording(
		contextEvents: readonly SidecarContextEvent[],
		editorUrl: string | undefined,
	) {
		if (editorUrl === undefined) {
			console.log('editorUrl not found');
			return;
		}
		const baseUrl = new URL(this._url);
		baseUrl.pathname = '/api/agentic/context_recording';
		const url = baseUrl.toString();
		const body = {
			context_events: contextEvents,
			editor_url: editorUrl,
		};
		await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
	}
}


interface CodeSelectionUriRange {
	uri: vscode.Uri;
	range: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
}

/**
 * This is a copy of the function below we are using this to use the chat window as a plan generation cli
 */
async function convertVSCodeVariableToSidecarHackingForPlan(
	variables: readonly vscode.ChatPromptReference[],
	query: string,
): Promise<UserContext> {
	const sidecarVariables: SidecarVariableTypes[] = [];
	let terminalSelection: string | undefined = undefined;
	const fileCache: Map<string, vscode.TextDocument> = new Map();
	const resolvedFileCache: Map<string, [string, string]> = new Map();

	const resolveFileReference = async (variableName: string, variableId: string, variableValue: string | vscode.Uri | vscode.Location | unknown) => {
		const parsedJson = JSON.parse(variableValue as string) as CodeSelectionUriRange;
		const filePath = vscode.Uri.parse(parsedJson.uri.path);
		const cachedFile = fileCache.get(filePath.fsPath);
		if (cachedFile === undefined) {
			const fileDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath.fsPath));
			fileCache.set(filePath.fsPath, fileDocument);
		}
		const fileDocument = fileCache.get(filePath.fsPath) as vscode.TextDocument;
		const startRange = {
			line: parsedJson.range.startLineNumber - 1,
			character: parsedJson.range.startColumn === 0 ? parsedJson.range.startColumn : parsedJson.range.startColumn - 1,
			byteOffset: 0,
		};
		const endRange = {
			line: parsedJson.range.endLineNumber - 1,
			character: parsedJson.range.endColumn === 0 ? parsedJson.range.endColumn : parsedJson.range.endColumn - 1,
			byteOffset: 0,
		};
		const variableType = getVariableType(
			variableName,
			variableId,
			startRange,
			endRange,
			fileDocument,
		);
		const content = fileDocument.getText(new vscode.Range(
			new vscode.Position(startRange.line, startRange.character),
			new vscode.Position(endRange.line, endRange.character),
		));
		resolvedFileCache.set(filePath.fsPath, [fileDocument.getText(), fileDocument.languageId]);
		if (variableType !== null) {
			sidecarVariables.push({
				name: variableName,
				start_position: startRange,
				end_position: endRange,
				fs_file_path: filePath.fsPath,
				type: variableType,
				content,
				language: fileDocument.languageId,
			});
		}
	};

	const folders: string[] = [];
	for (const variable of variables) {
		const variableName = variable.name;
		const value = variable.value;
		const variableId = variable.id;
		const name = variableName.split(':')[0];
		if (name === TERMINAL_SELECTION_VARIABLE) {
			// we are looking at the terminal selection and we have some value for it
			terminalSelection = value as string;
		} else if (name === OPEN_FILES_VARIABLE) {
			const openFiles = vscode.window.visibleTextEditors;
			const openFileVariables = openFiles.filter(file => file.document.uri.scheme === 'file').map(file => {
				return {
					name: file.document.uri.fsPath,
					start_position: {
						line: 0,
						character: 0,
						byteOffset: 0,
					},
					end_position: {
						line: file.document.lineCount,
						character: 1,
						byteOffset: 0,
					},
					fs_file_path: file.document.uri.fsPath,
					type: getFileType(),
					content: file.document.getText(),
					language: file.document.languageId,
				};
			});
			sidecarVariables.push(...openFileVariables);
			// await resolveFileReference('file', value);
		} else if (name === 'file' || name === 'code') {
			await resolveFileReference(name, variableId, value);
		} else if (name === 'folder') {
			const folderPath = value as vscode.Uri;
			folders.push(folderPath.fsPath);
		}
	}

	let isPlanGeneration = false;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === GENERATE_PLAN) {
			isPlanGeneration = true;
		}
	}

	let isPlanExecutionUntil = null;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === 'EXECUTE_UNTIL') {
			const queryParts = query.split(' ');
			if (queryParts.length === 2) {
				isPlanExecutionUntil = parseInt(queryParts[1]);
			}
			// if we have execute until then we need to grab the number right after the range where we are at
		}
	}

	let isPlanAppend = false;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === 'APPEND_TO_PLAN') {
			isPlanAppend = true;
		}
	}

	let isIncludeLSP = false;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === 'LSP') {
			console.log('lspppppp');
			isIncludeLSP = true;
		}
	}

	let isPlanDropFrom = null;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === 'DROP_PLAN_STEP_FROM') {
			const queryParts = query.split(' ');
			if (queryParts.length === 2) {
				isPlanDropFrom = parseInt(queryParts[1]);
			}
			// if we have execute until then we need to grab the number right after the range where we are at
		}
	}

	return {
		variables: sidecarVariables,
		file_content_map: Array.from(resolvedFileCache.entries()).map(([filePath, fileContent]) => {
			return {
				file_path: filePath,
				file_content: fileContent[0],
				language: fileContent[1],
			};
		}),
		terminal_selection: terminalSelection,
		folder_paths: folders,
		is_plan_generation: isPlanGeneration,
		is_plan_execution_until: isPlanExecutionUntil,
		is_plan_append: isPlanAppend,
		is_lsp_run: isIncludeLSP,
		is_plan_drop_from: isPlanDropFrom,
	};
}

async function convertVSCodeVariableToSidecar(
	variables: readonly vscode.ChatPromptReference[],
): Promise<UserContext> {
	const sidecarVariables: SidecarVariableTypes[] = [];
	let terminalSelection: string | undefined = undefined;
	const fileCache: Map<string, vscode.TextDocument> = new Map();
	const resolvedFileCache: Map<string, [string, string]> = new Map();

	const resolveFileReference = async (variableName: string, variableId: string, variableValue: string | vscode.Uri | vscode.Location | unknown) => {
		const parsedJson = JSON.parse(variableValue as string) as CodeSelectionUriRange;
		const filePath = vscode.Uri.parse(parsedJson.uri.path);
		const cachedFile = fileCache.get(filePath.fsPath);
		if (cachedFile === undefined) {
			const fileDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath.fsPath));
			fileCache.set(filePath.fsPath, fileDocument);
		}
		const fileDocument = fileCache.get(filePath.fsPath) as vscode.TextDocument;
		const startRange = {
			line: parsedJson.range.startLineNumber,
			character: parsedJson.range.startColumn,
			byteOffset: 0,
		};
		const endRange = {
			line: parsedJson.range.endLineNumber,
			character: parsedJson.range.endColumn,
			byteOffset: 0,
		};
		const variableType = getVariableType(
			variableName,
			variableId,
			startRange,
			endRange,
			fileDocument,
		);
		const content = fileDocument.getText(new vscode.Range(
			new vscode.Position(startRange.line, startRange.character),
			new vscode.Position(endRange.line, endRange.character),
		));
		resolvedFileCache.set(filePath.fsPath, [fileDocument.getText(), fileDocument.languageId]);
		if (variableType !== null) {
			sidecarVariables.push({
				name: variableName,
				start_position: startRange,
				end_position: endRange,
				fs_file_path: filePath.fsPath,
				type: variableType,
				content,
				language: fileDocument.languageId,
			});
		}
	};

	const folders: string[] = [];
	for (const variable of variables) {
		const variableName = variable.name;
		const variableId = variable.id;
		const value = variable.value;
		const name = variableName.split(':')[0];
		if (name === TERMINAL_SELECTION_VARIABLE) {
			// we are looking at the terminal selection and we have some value for it
			terminalSelection = value as string;
		} else if (name === OPEN_FILES_VARIABLE) {
			await resolveFileReference('file', variableId, value);
		} else if (name === 'file' || name === 'code') {
			await resolveFileReference(name, variableId, value);
		} else if (name === 'folder') {
			const folderPath = value as vscode.Uri;
			folders.push(folderPath.fsPath);
		}
	}

	let isPlanGeneration = false;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === GENERATE_PLAN) {
			isPlanGeneration = true;
		}
	}

	let isIncludeLSP = false;
	for (const variable of variables) {
		const variableName = variable.name;
		const name = variableName.split(':')[0];
		if (name === 'LSP') {
			isIncludeLSP = true;
		}
	}

	return {
		variables: sidecarVariables,
		file_content_map: Array.from(resolvedFileCache.entries()).map(([filePath, fileContent]) => {
			return {
				file_path: filePath,
				file_content: fileContent[0],
				language: fileContent[1],
			};
		}),
		terminal_selection: terminalSelection,
		folder_paths: folders,
		is_plan_generation: isPlanGeneration,
		is_plan_execution_until: null,
		is_plan_append: false,
		is_lsp_run: isIncludeLSP,
		is_plan_drop_from: null,
	};
}

function getFileType(): SidecarVariableType {
	return 'File';
}

function getVariableType(
	name: string,
	variableId: string,
	startPosition: Position,
	endPosition: Position,
	textDocument: vscode.TextDocument,
): SidecarVariableType | null {
	if (name === 'currentFile') {
		return 'File';
	} else if (variableId === 'vscode.file') {
		return 'File';
	} else if (name.startsWith('file')) {
		// here we have to check if the range is the full file or just a partial
		// range in which case its a selection
		const textLines = textDocument.lineCount;
		if (startPosition.line === 1 && endPosition.line === textLines) {
			return 'File';
		} else {
			return 'Selection';
		}
	}
	return 'CodeSymbol';
}

function getCurrentActiveWindow(): {
	file_path: string;
	file_content: string;
	visible_range_content: string;
	start_line: number;
	end_line: number;
	language: string;
} | undefined {
	const activeWindow = vscode.window.activeTextEditor;
	if (activeWindow === undefined) {
		return undefined;
	}
	if (activeWindow.visibleRanges.length === 0) {
		// Then we return the full length of the file here or otherwise
		// we return whats present in the range
		return undefined;
	}
	const visibleRanges = activeWindow.visibleRanges;
	const startPosition = activeWindow.visibleRanges[0].start;
	const endPosition = activeWindow.visibleRanges[visibleRanges.length - 1].end;
	const fsFilePath = activeWindow.document.uri.fsPath;
	const range = new vscode.Range(
		startPosition.line,
		0,
		endPosition.line,
		activeWindow.document.lineAt(endPosition.line).text.length
	);
	const visibleRagneContents = activeWindow.document.getText(range);
	const contents = activeWindow.document.getText();
	return {
		file_path: fsFilePath,
		file_content: contents,
		visible_range_content: visibleRagneContents,
		// as these are 0 indexed
		start_line: startPosition.line + 1,
		end_line: endPosition.line + 1,
		language: activeWindow.document.languageId,
	};
}
