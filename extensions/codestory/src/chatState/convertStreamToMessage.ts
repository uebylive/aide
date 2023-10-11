/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { CSChatProgress, CSChatProgressTask, CSChatProgressContent, CSChatCancellationToken } from '../providers/chatprovider';
import { OpenAIChatTypes } from '@axflow/models/openai/chat';
import { StreamToIterable } from '@axflow/models/shared';
import { ConversationMessageOkay } from '../sidecar/types';

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
	stream: AsyncIterator<ConversationMessageOkay>,
	progress: vscode.Progress<CSChatProgress>,
	cancellationToken: CSChatCancellationToken,
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
		// if we don't have the message id here that means this is an ack request so
		// we should just report that we are processing it on the backend
		const sessionId = firstPart.value.data.session_id;
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
		if (conversationMessage.data.answer !== null) {
			progress.report(new CSChatProgressContent(conversationMessage.data.answer));
			finalMessage = conversationMessage.data.answer;
			return finalMessage;
		} else {
			const stepsTaken = conversationMessage.data.steps_taken.length;
			const lastStep = conversationMessage.data.steps_taken[stepsTaken - 1];
			if (lastStep.type === 'Path') {
				progress.report(new CSChatProgressContent(lastStep.response));
				finalMessage = lastStep.response;
			} else if (lastStep.type === 'Code') {
				progress.report(new CSChatProgressContent(lastStep.response));
				finalMessage = lastStep.response;
			} else if (lastStep.type === 'Proc') {
				progress.report(new CSChatProgressContent(lastStep.response));
				finalMessage = lastStep.response;
			}
		}
	}

	return finalMessage;
};


// export const reportFromStreamToProgressAx = async (
// 	streamPromise: Promise<ReadableStream<string> | null>,
// 	progress: vscode.Progress<CSChatProgress>,
// 	cancellationToken: CSChatCancellationToken,
// ): Promise<string> => {
// 	let finalMessage = '';
// 	const stream = await streamPromise;
// 	if (!stream) {
//      // allow-any-unicode-next-line
// 		return 'No reply from the LLM 🥲';
// 	}

// 	if (cancellationToken.isCancellationRequested) {
// 		return finalMessage;
// 	}

// 	let hasCalledFirstPartOfMessage = false;
// 	let firstPartOfMessage: (part: CSChatProgressContent) => void;
// 	const promise = new Promise<CSChatProgressContent>((resolve) => {
// 		firstPartOfMessage = resolve;
// 	});

// 	// This polls the firstPartOfMessage() function and when its finished,
// 	// we move on to the next bits.
// 	progress.report(new CSChatProgressTask(
// 		// allow-any-unicode-next-line
// 		'Thinking... 🤔',
// 		promise,
// 	));

// 	if (cancellationToken.isCancellationRequested) {
// 		return finalMessage;
// 	}

// 	for await (const part of StreamToIterable(stream)) {
// 		if (!hasCalledFirstPartOfMessage) {
// 			firstPartOfMessage(new CSChatProgressContent(part ?? ''));
// 			hasCalledFirstPartOfMessage = true;
// 		}

// 		finalMessage += part ?? '';
// 		if (cancellationToken.isCancellationRequested) {
// 			return finalMessage;
// 		}
// 		progress.report(new CSChatProgressContent(part ?? ''));
// 	}

// 	return finalMessage;
// };
