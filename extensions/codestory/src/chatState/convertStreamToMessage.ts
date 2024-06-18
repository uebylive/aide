/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { AgentStep, CodeSpan, ConversationMessage } from '../sidecar/types';
import { RepoRef, SideCarClient } from '../sidecar/client';
import { SideCarAgentEvent } from '../server/types';


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

export const reportDummyEventsToChat = async (
	response: vscode.ProbeResponseStream,
): Promise<void> => {
	const paths = [
		{
			symbol_name: 'agent_router',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/bin/webserver.rs',
			query: 'How does the LLM ccommunicaet with the agent?',
			reason: 'What are the different components of the agent? What are the different methods of the agent?',
		},
		{
			symbol_name: 'agent_router',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/bin/webserver.rs',
			query: 'How does the LLM ccommunicate with the agent?',
			reason: 'What are the different components of the agent? What are the different methods of the agent?',
		},
		{
			symbol_name: 'agent_router',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/bin/webserver.rs',
			query: 'How does the agent communicate with the LLM? Why is the agent important?',
			reason: 'What are the different components of the agent? What are the different methods of the agent?',
		},
		{
			symbol_name: 'ExplainRequest',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent.rs',
			query: 'What does the agent do in the code base? What are the different components of the agent? What are the different methods of the agent?',
			reason: 'It has methods like answer, answer_context, and code_search_hybrid that handle tasks like constructing prompts, managing token limits, streaming LLM responses, and updating the conversation context.'
		},
		{
			symbol_name: 'trim_utter_history',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/search.rs',
			query: 'What are the different search algorithms used by the agent?',
			reason: 'The agent likely orchestrates different search algorithms (semantic, lexical, git log analysis) and combines their results by communicating with the LLMs through the various brokers and components.',
			response: 'The agent uses various search algorithms like semantic search, lexical search, and git log analysis to find relevant code snippets and explanations.'
		},
		{
			symbol_name: 'ConversationMessage',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/types.rs',
			query: 'What are the different types used by the agent?',
			reason: 'The agent uses various types to represent different data structures and entities in the code base.'
		},
		{
			symbol_name: 'agent_router',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/bin/webserver.rs',
			response: 'The agent communicates with the Large Language Models (LLMs) through various components and methods.'
		},
		{
			symbol_name: 'generate_agent_stream',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent_stream.rs',
			query: 'How does the agent stream responses to the user?',
			reason: 'The agent streams responses to the user by sending partial responses and updates as they become available.',
			response: 'The agent sends partial responses and updates to the user as they become available to stream responses.'
		},
		{
			symbol_name: 'ExplainRequest',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent.rs',
			response: 'The agent acts as a central hub for coordinating the communication with LLMs.'
		},
		{
			symbol_name: 'trim_utter_history',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/search.rs',
			response: 'The agent orchestrates different search algorithms and combines their results by communicating with the LLMs.'
		},
		{
			symbol_name: 'ConversationMessage',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/agent/types.rs',
			response: 'The agent uses various types to represent different data structures and entities.'
		},
		{
			symbol_name: 'generate_agent_stream',
			path: '/Users/nareshr/github/codestory/sidecar/sidecar/src/webserver/agent_stream.rs',
			response: 'The agent streams responses to the user by sending partial responses and updates.'
		}
	];

	for (const path of paths) {
		response.breakdown({
			reference: { uri: vscode.Uri.file(path.path), name: path.symbol_name },
			query: new vscode.MarkdownString(path.query),
			reason: new vscode.MarkdownString(path.reason),
			response: response ? new vscode.MarkdownString(path.response) : undefined
		});
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	// Wait 5 seconds
	await new Promise(resolve => setTimeout(resolve, 1000));

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
	stream: AsyncIterator<SideCarAgentEvent>,
	response: vscode.ProbeResponseStream,
	threadId: string,
	token: vscode.CancellationToken,
	sidecarClient: SideCarClient,
): Promise<void> => {
	const asyncIterable = {
		[Symbol.asyncIterator]: () => stream
	};

	// now we ping the sidecar that the probing needs to stop
	if (token.isCancellationRequested) {
		await sidecarClient.stopAgentProbe(threadId);
		return;
	}

	for await (const event of asyncIterable) {
		// now we ping the sidecar that the probing needs to stop
		if (token.isCancellationRequested) {
			await sidecarClient.stopAgentProbe(threadId);
			return;
		}
		if ('keep_alive' in event) {
			continue;
		}

		if (event.event.SymbolEvent) {
			const symbolEventKeys = Object.keys(event.event.SymbolEvent.event);
			if (symbolEventKeys.length === 0) {
				continue;
			}
			const symbolEventKey = symbolEventKeys[0] as keyof typeof event.event.SymbolEvent.event;
			// If this is a symbol event then we have to make sure that we are getting the probe request over here
			if (symbolEventKey === 'Probe' && event.event.SymbolEvent.event.Probe !== undefined) {
				response.breakdown({
					reference: {
						uri: vscode.Uri.file(event.event.SymbolEvent.event.Probe.symbol_identifier.fs_file_path ?? 'symbol_not_found'),
						name: event.event.SymbolEvent.event.Probe.symbol_identifier.symbol_name,
					},
					// setting both of these to be the same thing, figure out if this is really necessary??
					query: new vscode.MarkdownString(event.event.SymbolEvent.event.Probe.probe_request),
					reason: new vscode.MarkdownString(event.event.SymbolEvent.event.Probe.probe_request),
				});
			}
		} else if (event.event.SymbolEventSubStep) {
			const { symbol_identifier, event: symbolEventSubStep } = event.event.SymbolEventSubStep;
			if ('GoToDefinition' in symbolEventSubStep) {
				// add decoration for now
				// const goToDefinition = symbolEventSubStep.GoToDefinition!;
				// await addDecoration(goToDefinition.fs_file_path, goToDefinition.range);
				continue;
			}
			if ('Probe' in symbolEventSubStep === false) {
				continue;
			}

			const probeSubStep = symbolEventSubStep.Probe!;
			const probeRequestKeys = Object.keys(probeSubStep) as (keyof typeof symbolEventSubStep.Probe)[];
			if (!symbol_identifier.fs_file_path || probeRequestKeys.length === 0) {
				continue;
			}

			const subStepType = probeRequestKeys[0];
			if (subStepType === 'ProbeAnswer' && probeSubStep.ProbeAnswer !== undefined) {
				const probeAnswer = probeSubStep.ProbeAnswer;
				response.breakdown({
					reference: {
						uri: vscode.Uri.file(symbol_identifier.fs_file_path),
						name: symbol_identifier.symbol_name
					},
					response: new vscode.MarkdownString(probeAnswer)
				});
			}
		}
	}
};
