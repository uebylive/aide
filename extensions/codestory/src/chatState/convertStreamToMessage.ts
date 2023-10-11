/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { CSChatProgress, CSChatProgressTask, CSChatProgressContent, CSChatCancellationToken } from '../providers/chatprovider';
import { OpenAIChatTypes } from '@axflow/models/openai/chat';
import { StreamToIterable } from '@axflow/models/shared';
import { ConversationMessage, ConversationMessageOkay } from '../sidecar/types';
import { RepoRef } from '../sidecar/client';
import { createFileTreeFromPaths } from './helpers';

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
		console.log('[search][stream] whats the first part here');
		console.log(firstPart);
		if (firstPart.done) {
			return new CSChatProgressContent(''); // Handle when iterator is done
		}
		// if we don't have the message id here that means this is an ack request so
		// we should just report that we are processing it on the backend
		// I know this ts-ignore is bad, but keeping it here for now
		// @ts-ignore
		const sessionId = firstPart.value['session_id'];
		return new CSChatProgressContent('Your session id is: ' + sessionId);
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

	for await (const conversationMessage of asyncIterable) {
		// First we check if we have the answer, if that's the case then we know
		// we have what we want to repo
		if (conversationMessage.answer !== null) {
			// We need to parse the answer a bit here, because we get relative paths
			// and not absolute paths. The right way to do this will be to attach
			// the reporef location to the message and that would solve a lot of
			// problems.
			const formattingFixAnswer = await formatPathsInAnswer(conversationMessage.answer, currentRepoRef);
			progress.report(new CSChatProgressContent(formattingFixAnswer));
			finalMessage = conversationMessage.answer;
			return finalMessage;
		} else {
			const stepsTaken = conversationMessage.steps_taken.length;
			const lastStep = conversationMessage.steps_taken[stepsTaken - 1];
			console.log(`[search][stream] whats the last step here`);
			console.log(lastStep);
			if ('Path' in lastStep) {
				progress.report(new CSChatProgressContent('Found relevant files...'));
				progress.report(
					new CSChatProgressTask(
						'Reading files for answer...',
						Promise.resolve(
							createFileTreeFromPaths(lastStep.Path.paths, workingDirectory),
						)
					)
				);
			} else if ('Code' in lastStep) {
				// progress.report(new CSChatProgressContent(lastStep.Code.response));
			} else if ('Proc' in lastStep) {
				// progress.report(new CSChatProgressContent(lastStep.Proc.response));
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
