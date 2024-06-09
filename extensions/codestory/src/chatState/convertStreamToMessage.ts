/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { AgentStep, CodeSpan, ConversationMessage } from '../sidecar/types';
import { RepoRef } from '../sidecar/client';
import { SideCarAgentEvent, SymbolIdentifier } from '../server/types';


export const reportFromStreamToSearchProgress = async (
	stream: AsyncIterator<ConversationMessage>,
	response: vscode.AideChatResponseStream,
	cancellationToken: vscode.CancellationToken,
	workingDirectory: string,
): Promise<string> => {
	let finalMessage = '';
	if (cancellationToken.isCancellationRequested) {
		return '';
	}
	const firstPartOfMessage = async () => {
		const firstPart = await stream.next();
		if (firstPart.done) {
			return ''; // Handle when iterator is done
		}
		// TODO(skcd): Lets not log the session-id here
		// if we don't have the message id here that means this is an ack request so
		// we should just report that we are processing it on the backend
		// I know this ts-ignore is bad, but keeping it here for now
		// @ts-ignore
		// const sessionId = firstPart.value['session_id'];
		// return new CSChatProgressContent('Your session id is: ' + sessionId);
		return '';
	};

	const progress = await firstPartOfMessage();
	response.markdown(progress);

	// Now we are in the good state, we can start reporting the progress by looking
	// at the last step the agent has taken and reporting that to the chat
	if (cancellationToken.isCancellationRequested) {
		return finalMessage;
	}

	const asyncIterable = {
		[Symbol.asyncIterator]: () => stream
	};

	let enteredAnswerGenerationLoop = false;

	for await (const conversationMessage of asyncIterable) {
		// First we check if we have the answer, if that's the case then we know
		// we have what we want to repo

		// We have hit our done status, so lets skip it
		if ('done' in conversationMessage) {
			continue;
		}
		// Here we will get an event which will have the conversation_state as 'ReRankingStarted' and another
		// which will have an event as 'ReRankingFinished'
		if (conversationMessage.conversation_state === 'ReRankingStarted') {
			console.log('ReRanking has started');
			continue;
		}
		if (conversationMessage.conversation_state === 'ReRankingFinished') {
			console.log('ReRanking has finsihed');
			continue;
		}
		if (conversationMessage.answer !== null && conversationMessage.conversation_state === 'StreamingAnswer') {
			// We need to parse the answer a bit here, because we get relative paths
			// and not absolute paths. The right way to do this will be to attach
			// the reporef location to the message and that would solve a lot of
			// problems.
			if (!enteredAnswerGenerationLoop) {
				response.markdown('\n');
				// progress.report(new CSChatProgressContent('\n## Answer\n\n' + conversationMessage.answer.delta));
				enteredAnswerGenerationLoop = true;
			} else {
				// type-safety here, altho it its better to do it this way
				if (conversationMessage.answer.delta !== null) {
					response.markdown(conversationMessage.answer.delta);
				}
			}
		} else if (conversationMessage.answer !== null && conversationMessage.conversation_state === 'Finished') {
			finalMessage = conversationMessage.answer.answer_up_until_now;
			return finalMessage;
		}
		else {
			const stepsTaken = conversationMessage.steps_taken.length;
			const lastStep = conversationMessage.steps_taken[stepsTaken - 1];
			if ('Code' in lastStep) {
				reportCodeReferencesToChat(
					response,
					lastStep.Code.code_snippets,
					workingDirectory,
				);
			} else if ('Proc' in lastStep) {
				reportProcUpdateToChat(response, lastStep, workingDirectory);
			}
		}
	}

	return finalMessage;
};


export const formatPathsInAnswer = async (answer: string, reporef: RepoRef): Promise<string> => {
	async function isPathLike(markdownLink: string): Promise<boolean> {
		// Here the markdown link at the end of it might have #L{blah}-L{blah2},
		// we want to remove that part and then check if the path exists.
		const markdownLinkWithoutLineNumbers = markdownLink.split('#')[0];
		const finalPath = path.join(reporef.getPath(), markdownLinkWithoutLineNumbers);
		try {
			console.log('[formatPathsInAnswer] checking the following path');
			console.log(finalPath);
			await vscode.workspace.fs.stat(vscode.Uri.file(finalPath));
			return true;
		} catch (error) {
			return false;
		}
	}

	async function fullPathify(content: string, basePath: string): Promise<string> {
		// Regular expression to match markdown links.
		// This captures the link text and the link target separately.
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

		let match;
		let lastIndex = 0;
		let resultString = '';

		while ((match = markdownLinkRegex.exec(content)) !== null) {
			// Add the previous unmatched text to the result
			resultString += content.slice(lastIndex, match.index);
			lastIndex = markdownLinkRegex.lastIndex;

			const [fullMatch, linkText, linkTarget] = match;

			if (await isPathLike(linkTarget)) {
				// If the link target looks like a path, replace it with the full path
				const fullPath = path.join(basePath, linkTarget);
				resultString += `[${linkText}](${fullPath})`;
			} else {
				// If not, add the original match
				resultString += fullMatch;
			}
		}

		// Add any remaining unmatched text to the result
		resultString += content.slice(lastIndex);

		return resultString;
	}

	return fullPathify(answer, reporef.getPath());
};


export const reportCodeSpansToChat = (codeSpans: CodeSpan[], workingDirectory: string): string => {
	// We limit it to 10 code spans.. and then show ... more or something here
	let suffixString = '';
	if (codeSpans.length > 5) {
		suffixString = '... and more code snippets\n\n';
	}
	const sortedCodeSpans = codeSpans.sort((a, b) => {
		if (a.score !== null && b.score !== null) {
			return b.score - a.score;
		}
		if (a.score !== null && b.score === null) {
			return -1;
		}
		if (a.score === null && b.score !== null) {
			return 1;
		}
		return 0;
	});
	let codeSpansString = '';
	for (let index = 0; index < Math.min(5, sortedCodeSpans.length); index++) {
		const currentCodeSpan = sortedCodeSpans[index];
		const fullFilePath = path.join(workingDirectory, currentCodeSpan.file_path);
		const currentFileLink = `${currentCodeSpan.file_path}#L${currentCodeSpan.start_line}-L${currentCodeSpan.end_line}`;
		const fileLink = `${fullFilePath}#L${currentCodeSpan.start_line}-L${currentCodeSpan.end_line}`;
		const markdownCodeSpan = `[${currentFileLink}](${fileLink})`;
		codeSpansString += markdownCodeSpan + '\n\n';
	}
	return '## Relevant code snippets\n\n' + codeSpansString + suffixString;
};

export const reportCodeReferencesToChat = (response: vscode.AideChatResponseStream, codeSpans: CodeSpan[], workingDirectory: string) => {
	const sortedCodeSpans = codeSpans.sort((a, b) => {
		if (a.score !== null && b.score !== null) {
			return b.score - a.score;
		}
		if (a.score !== null && b.score === null) {
			return -1;
		}
		if (a.score === null && b.score !== null) {
			return 1;
		}
		return 0;
	});
	for (let index = 0; index < Math.min(6, sortedCodeSpans.length); index++) {
		const currentCodeSpan = sortedCodeSpans[index];
		console.log(workingDirectory);
		let fullFilePath = currentCodeSpan.file_path;
		if (!currentCodeSpan.file_path.startsWith(workingDirectory)) {
			fullFilePath = path.join(workingDirectory, currentCodeSpan.file_path);
		}
		response.reference(new vscode.Location(
			vscode.Uri.file(fullFilePath),
			new vscode.Range(
				new vscode.Position(currentCodeSpan.start_line, 0),
				new vscode.Position(currentCodeSpan.end_line, 0),
			),
		));
	}
};


export const reportProcUpdateToChat = (
	progress: vscode.AideChatResponseStream,
	proc: AgentStep,
	workingDirectory: string,
) => {
	if ('Proc' in proc) {
		const paths = proc.Proc.paths;
		for (let index = 0; index < Math.min(5, paths.length); index++) {
			const currentPath = paths[index];
			const fullFilePath = path.join(workingDirectory, currentPath);
			progress.reference(vscode.Uri.file(fullFilePath));
		}
	}
};

const parseProbeQuestionAskRequest = (query: string): { userQuery: string; probeReason: string } => {
	const userQueryRegex = /(?:The original user query is:|The user has asked the following query:)\s*(.+?)(?:\n|$)/;
	const probeReasonRegex = /We also (?:believe|belive) this symbol needs to be probed because of:\s*(.+)/s;

	const userQueryMatch = query.match(userQueryRegex);
	const probeReasonMatch = query.match(probeReasonRegex);

	const userQuery = userQueryMatch ? userQueryMatch[1].trim() : '';
	const probeReason = probeReasonMatch ? probeReasonMatch[1].trim() : '';

	return { userQuery, probeReason };
};

export const reportDummyEventsToChat = async (
	response: vscode.AideChatResponseStream,
): Promise<void> => {
	const paths = [
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/bin/webserver.rs'
		},
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent.rs'
		},
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/search.rs'
		},
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/types.rs'
		},
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/user_context.rs'
		},
		{
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent_stream.rs'
		}
	];

	for (const { path } of paths) {
		response.breakdown({
			reference: vscode.Uri.file(path),
			query: new vscode.MarkdownString('dummy query'),
			reason: new vscode.MarkdownString('dummy reason')
		});
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	// Wait 5 seconds
	await new Promise(resolve => setTimeout(resolve, 5000));

	response.markdown(new vscode.MarkdownString(`Based on the code and probing results, the agent communicates with the Large Language Models (LLMs) through various components and methods:

1. The \`agent_router\` function sets up the API routes for different agent actions like search, hybrid search, explanation, and follow-up chat.

2. For follow-up chat queries, the \`followup_chat\` function is called. It retrieves the previous conversation context, creates a new \`ConversationMessage\` with the user's query, and prepares an \`Agent\` instance using \`Agent::prepare_for_followup\`.

3. The \`Agent\` instance acts as a central hub for coordinating the communication with LLMs. It has methods like \`answer\`, \`answer_context\`, and \`code_search_hybrid\` (defined in \`agent/search.rs\`) that handle tasks like constructing prompts, managing token limits, streaming LLM responses, and updating the conversation context.

4. The \`Agent\` struct utilizes various sub-components like \`LLMBroker\`, \`LLMTokenizer\`, \`LLMChatModelBroker\`, and \`ReRankBroker\` to generate contextual and relevant responses using the LLMs.

5. For example, in the \`hybrid_search\` function, the \`agent.code_search_hybrid(&query)\` method is called, which likely orchestrates different search algorithms (semantic, lexical, git log analysis) and combines their results by communicating with the LLMs through the various brokers and components.

So in summary, the \`Agent\` struct acts as an intermediary that coordinates the communication with LLMs through its various methods and sub-components like brokers, tokenizers, and rerankers, to generate relevant responses based on the user's query and conversation context.`)
	);
};

export const reportAgentEventsToChat = async (
	query_symbol_identifier: SymbolIdentifier,
	stream: AsyncIterator<SideCarAgentEvent>,
	response: vscode.AideChatResponseStream,
): Promise<void> => {
	const asyncIterable = {
		[Symbol.asyncIterator]: () => stream
	};

	const openFiles = new Set<string>();
	const addReference = (fsFilePath: string, response: vscode.AideChatResponseStream) => {
		if (openFiles.has(fsFilePath)) {
			return;
		}

		openFiles.add(fsFilePath);
		response.reference(vscode.Uri.file(fsFilePath));
	};

	for await (const event of asyncIterable) {
		if ('keep_alive' in event) {
			continue;
		}

		if (event.event.ToolEvent) {
			const toolEventKeys = Object.keys(event.event.ToolEvent);
			if (toolEventKeys.length === 0) {
				continue;
			}

			const toolEventKey = toolEventKeys[0] as keyof typeof event.event.ToolEvent;
			if (toolEventKey === 'OpenFile' && event.event.ToolEvent.OpenFile !== undefined) {
				const openFileEvent = event.event.ToolEvent.OpenFile;
				if (openFileEvent.fs_file_path === undefined) {
					continue;
				}

				const fsFilePath = openFileEvent.fs_file_path;
				addReference(fsFilePath, response);
			} else if (toolEventKey === 'ProbeQuestionAskRequest' && event.event.ToolEvent.ProbeQuestionAskRequest !== undefined) {
				const probeQuestionAskRequest = event.event.ToolEvent.ProbeQuestionAskRequest;
				const { userQuery, probeReason } = parseProbeQuestionAskRequest(probeQuestionAskRequest.query);
				if (
					probeQuestionAskRequest.fs_file_path !== query_symbol_identifier.fs_file_path
					|| probeQuestionAskRequest.symbol_identifier !== query_symbol_identifier.symbol_name) {
					response.breakdown({
						reference: vscode.Uri.file(probeQuestionAskRequest.fs_file_path),
						query: new vscode.MarkdownString(userQuery),
						reason: new vscode.MarkdownString(probeReason)
					});
				}
			}
		} else if (event.event.SymbolEvent) {
			const { event: symbolEvent } = event.event.SymbolEvent;
			const symbolEventKeys = Object.keys(symbolEvent);
			if (symbolEventKeys.length === 0) {
				continue;
			}

			const symbolEventKey = symbolEventKeys[0] as keyof typeof symbolEvent;
			if (symbolEventKey === 'Probe') {
				const probeEvent = symbolEvent.Probe;
				if (probeEvent.symbol_identifier.fs_file_path !== undefined) {
					response.breakdown({
						reference: vscode.Uri.file(probeEvent.symbol_identifier.fs_file_path),
						query: new vscode.MarkdownString(probeEvent.probe_request),
					});
				}
			}
		} else if (event.event.SymbolEventSubStep) {
			const { symbol_identifier, event: symbolEventSubStep } = event.event.SymbolEventSubStep;
			const probeRequestKeys = Object.keys(symbolEventSubStep.Probe) as (keyof typeof symbolEventSubStep.Probe)[];
			if (!symbol_identifier.fs_file_path || probeRequestKeys.length === 0) {
				continue;
			}

			const subStepType = probeRequestKeys[0];
			if (subStepType === 'ProbeAnswer' && symbolEventSubStep.Probe.ProbeAnswer !== undefined) {
				const probeAnswer = symbolEventSubStep.Probe.ProbeAnswer;
				if (
					symbol_identifier.fs_file_path === query_symbol_identifier.fs_file_path
					&& symbol_identifier.symbol_name === query_symbol_identifier.symbol_name
				) {
					response.markdown(probeAnswer);
				} else {
					response.breakdown({
						reference: vscode.Uri.file(symbol_identifier.fs_file_path),
						response: new vscode.MarkdownString(probeAnswer)
					});
				}
			}
		}
	}
};
