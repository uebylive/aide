/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { CSChatProgress, CSChatProgressTask, CSChatProgressContent, CSChatCancellationToken, CSChatProgressUsedContext } from '../providers/chatprovider';
import { OpenAIChatTypes } from '@axflow/models/openai/chat';
import { StreamToIterable } from '@axflow/models/shared';
import { AgentStep, CodeSpan, ConversationMessage, ConversationMessageOkay } from '../sidecar/types';
import { RepoRef } from '../sidecar/client';
import { createFileTreeFromPaths } from './helpers';
import * as math from 'mathjs';

// Here we are going to convert the stream of messages to progress messages
// which we can report back on to the chat
export const reportFromStreamToProgress = async (
	streamPromise: Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk> | null>,
	progress: vscode.Progress<CSChatProgress>,
	cancellationToken: CSChatCancellationToken,
): Promise<string> => {
	let finalMessage = '';
	const stream = await streamPromise;
	if (!stream) {
		// allow-any-unicode-next-line
		return 'No reply from the LLM 🥲';
	}

	const streamIterator = stream[Symbol.asyncIterator]();

	if (cancellationToken.isCancellationRequested) {
		return finalMessage;
	}

	const firstPartOfMessage = async () => {
		const firstPart = await streamIterator.next();
		if (firstPart.done) {
			return new CSChatProgressContent(''); // Handle when iterator is done
		}
		finalMessage += firstPart.value.choices[0]?.delta?.content ?? '';
		return new CSChatProgressContent(firstPart.value.choices[0]?.delta?.content ?? '');
	};

	progress.report(new CSChatProgressTask(
		// allow-any-unicode-next-line
		'Thinking... 🤔',
		firstPartOfMessage(),
	));

	if (cancellationToken.isCancellationRequested) {
		return finalMessage;
	}

	const asyncIterable = {
		[Symbol.asyncIterator]: () => streamIterator
	};

	for await (const part of asyncIterable) {
		finalMessage += part.choices[0]?.delta?.content ?? '';
		if (cancellationToken.isCancellationRequested) {
			return finalMessage;
		}
		progress.report(new CSChatProgressContent(part.choices[0]?.delta?.content ?? ''));
	}

	return finalMessage;
};


export const reportFromStreamToSearchProgress = async (
	stream: AsyncIterator<ConversationMessage>,
	progress: vscode.Progress<CSChatProgress>,
	cancellationToken: CSChatCancellationToken,
	currentRepoRef: RepoRef,
	workingDirectory: string,
): Promise<string> => {
	let finalMessage = '';
	if (cancellationToken.isCancellationRequested) {
		return '';
	}
	const firstPartOfMessage = async () => {
		const firstPart = await stream.next();
		if (firstPart.done) {
			return new CSChatProgressContent(''); // Handle when iterator is done
		}
		// TODO(skcd): Lets not log the session-id here
		// if we don't have the message id here that means this is an ack request so
		// we should just report that we are processing it on the backend
		// I know this ts-ignore is bad, but keeping it here for now
		// @ts-ignore
		// const sessionId = firstPart.value['session_id'];
		// return new CSChatProgressContent('Your session id is: ' + sessionId);
		return new CSChatProgressContent('');
	};

	progress.report(new CSChatProgressTask(
		// allow-any-unicode-next-line
		'Thinking... 🤔',
		firstPartOfMessage(),
	));

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
		if (conversationMessage.answer !== null && conversationMessage.conversation_state === 'StreamingAnswer') {
			// We need to parse the answer a bit here, because we get relative paths
			// and not absolute paths. The right way to do this will be to attach
			// the reporef location to the message and that would solve a lot of
			// problems.
			if (!enteredAnswerGenerationLoop) {
				progress.report(new CSChatProgressContent('\n'));
				// progress.report(new CSChatProgressContent('\n## Answer\n\n' + conversationMessage.answer.delta));
				enteredAnswerGenerationLoop = true;
			} else {
				// type-safety here, altho it its better to do it this way
				if (conversationMessage.answer.delta !== null) {
					progress.report(new CSChatProgressContent(conversationMessage.answer.delta));
				}
			}
		} else if (conversationMessage.answer !== null && conversationMessage.conversation_state === 'Finished') {
			finalMessage = conversationMessage.answer.answer_up_until_now;
			return finalMessage;
		}
		else {
			const stepsTaken = conversationMessage.steps_taken.length;
			const lastStep = conversationMessage.steps_taken[stepsTaken - 1];
			console.log(`[search][stream] whats the last step here`);
			console.log(lastStep);
			if ('Path' in lastStep) {
				progress.report(new CSChatProgressContent('## Found relevant files'));
				progress.report(
					new CSChatProgressTask(
						'Reading files for answer...',
						Promise.resolve(
							createFileTreeFromPaths(lastStep.Path.paths, workingDirectory),
						)
					)
				);
			} else if ('Code' in lastStep) {
				progress.report(
					new CSChatProgressContent(
						reportCodeSpansToChat(
							lastStep.Code.code_snippets,
							workingDirectory,
						)
					)
				);
				progress.report(
					reportCodeReferencesToChat(
						lastStep.Code.code_snippets,
						workingDirectory,
					),
				);
			} else if ('Proc' in lastStep) {
				const procOutput = reportProcUpdateToChat(lastStep, workingDirectory);
				progress.report(
					new CSChatProgressContent(
						procOutput === null ? 'No files found' : procOutput
					)
				);
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
	for (let index = 0; index < math.min(5, sortedCodeSpans.length); index++) {
		const currentCodeSpan = sortedCodeSpans[index];
		const fullFilePath = path.join(workingDirectory, currentCodeSpan.file_path);
		const currentFileLink = `${currentCodeSpan.file_path}#L${currentCodeSpan.start_line}-L${currentCodeSpan.end_line}`;
		const fileLink = `${fullFilePath}#L${currentCodeSpan.start_line}-L${currentCodeSpan.end_line}`;
		const markdownCodeSpan = `[${currentFileLink}](${fileLink})`;
		codeSpansString += markdownCodeSpan + '\n\n';
	}
	return '## Relevant code snippets\n\n' + codeSpansString + suffixString;
};

export const reportCodeReferencesToChat = (codeSpans: CodeSpan[], workingDirectory: string): CSChatProgressUsedContext => {
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
	const documentContext: vscode.DocumentContext[] = [];
	for (let index = 0; index < math.min(6, sortedCodeSpans.length); index++) {
		const currentCodeSpan = sortedCodeSpans[index];
		const fullFilePath = path.join(workingDirectory, currentCodeSpan.file_path);
		documentContext.push({
			uri: vscode.Uri.file(fullFilePath),
			version: 1,
			ranges: [
				new vscode.Range(
					new vscode.Position(currentCodeSpan.start_line, 0),
					new vscode.Position(currentCodeSpan.end_line, 0),
				),
			],
		});
	}
	return new CSChatProgressUsedContext(documentContext);
};


export const reportProcUpdateToChat = (
	proc: AgentStep,
	workingDirectory: string,
): string | null => {
	if ('Proc' in proc) {
		const paths = proc.Proc.paths;
		let suffixString = '';
		if (proc.Proc.paths.length > 5) {
			suffixString = '... and more files\n\n';
		}
		let procString = '';
		for (let index = 0; index < math.min(5, paths.length); index++) {
			const currentPath = paths[index];
			const fullFilePath = path.join(workingDirectory, currentPath);
			const currentFileLink = `${currentPath}`;
			const fileLink = `${fullFilePath}`;
			const markdownCodeSpan = `[${currentFileLink}](${fileLink})`;
			procString += markdownCodeSpan + '\n\n';
		}
		return '## Reading from relevant files\n\n' + procString + suffixString;
	}
	return null;
};
