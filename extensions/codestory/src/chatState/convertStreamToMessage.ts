/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { CSChatProgress, CSChatProgressTask, CSChatProgressContent, CSChatCancellationToken, CSChatProgressFileTree, CSChatFileTreeData } from '../providers/chatprovider';

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

	const getTree = async () => {
		const fileTree = new CSChatProgressFileTree(
			new CSChatFileTreeData(
				'website',
				vscode.Uri.parse('file:///Users/nareshr/github/codestory/website'),
				[
					new CSChatFileTreeData(
						'utils',
						vscode.Uri.parse('file:///Users/nareshr/github/codestory/website/utils'),
						[new CSChatFileTreeData(
							'date-formatter.tsx',
							vscode.Uri.parse('file:///Users/nareshr/github/codestory/website/utils/date-formatter.tsx'),
						)])]
			));
		return fileTree;
	};

	progress.report(new CSChatProgressTask(
		'Generating tree...',
		getTree(),
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
