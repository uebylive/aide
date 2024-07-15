/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { AgentStep, CodeSpan, ConversationMessage } from '../sidecar/types';
import { RepoRef, SideCarClient } from '../sidecar/client';
import { SideCarAgentEvent } from '../server/types';
//import { addDecoration } from './decorations/add';


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

export const readJsonFile = (filePath: string): any => {
	const jsonString = fs.readFileSync(filePath, 'utf-8');
	return JSON.parse(jsonString);
};

const pattern = /(?:^|\s)(\w+\s+at\s+[\w/.-]+)?(.*)/s;
export const reportAgentEventsToChat = async (
	editMode: boolean,
	stream: AsyncIterableIterator<SideCarAgentEvent>,
	response: vscode.ProbeResponseStream,
	threadId: string,
	token: vscode.CancellationToken,
	sidecarClient: SideCarClient,
): Promise<void> => {
	console.log('reportAgentEventsToChat starting');
	const asyncIterable = {
		[Symbol.asyncIterator]: () => stream
	};

	// now we ping the sidecar that the probing needs to stop
	if (token.isCancellationRequested) {
		await sidecarClient.stopAgentProbe(threadId);
		return;
	}

	//await new Promise((resolve) => setTimeout(resolve, 1000));

	const randomInt = (min: number, max: number) =>
		Math.floor(Math.random() * (max - min + 1)) + min;

	// Temp code: Create a new file to record logs
	// const logPath = path.join('/Users/nareshr/github/codestory/sidecar', 'probeLogs.json');
	// const logStream = fs.createWriteStream(logPath, { flags: 'a' });
	// logStream.write('[');

	for await (const event of asyncIterable) {
		await new Promise((resolve) => setTimeout(resolve, randomInt(0, 2) * 50));
		// now we ping the sidecar that the probing needs to stop
		if (token.isCancellationRequested) {
			await sidecarClient.stopAgentProbe(threadId);
			console.log('Stopped the agent probe');
			break;
		}

		if ('keep_alive' in event) {
			continue;
		}

		// logStream.write(JSON.stringify(event) + ',\n');

		if (event.event.SymbolEvent) {
			const symbolEvent = event.event.SymbolEvent.event;
			const symbolEventKeys = Object.keys(symbolEvent);
			if (symbolEventKeys.length === 0) {
				continue;
			}
			const symbolEventKey = symbolEventKeys[0] as keyof typeof symbolEvent;
			// If this is a symbol event then we have to make sure that we are getting the probe request over here
			if (editMode && symbolEventKey === 'Probe' && symbolEvent.Probe !== undefined) {
				response.breakdown({
					reference: {
						uri: vscode.Uri.file(symbolEvent.Probe.symbol_identifier.fs_file_path ?? 'symbol_not_found'),
						name: symbolEvent.Probe.symbol_identifier.symbol_name,
					},
					query: new vscode.MarkdownString(symbolEvent.Probe.probe_request)
				});
			} else if (symbolEventKey === 'Edit') {
				response.codeEditPreview({
					reference: {
						uri: vscode.Uri.file(symbolEvent.Edit.symbol_identifier.fs_file_path ?? 'symbol_not_found'),
						name: symbolEvent.Edit.symbol_identifier.symbol_name
					},
					ranges: symbolEvent.Edit.symbols.map(symbolToEdit =>
						new vscode.Range(
							new vscode.Position(symbolToEdit.range.startPosition.line, symbolToEdit.range.startPosition.character),
							new vscode.Position(symbolToEdit.range.endPosition.line, symbolToEdit.range.endPosition.character)
						))
				});
			}
		} else if (event.event.SymbolEventSubStep) {
			const { symbol_identifier, event: symbolEventSubStep } = event.event.SymbolEventSubStep;
			if (!symbol_identifier.fs_file_path) {
				continue;
			}

			if (symbolEventSubStep.GoToDefinition) {
				const goToDefinition = symbolEventSubStep.GoToDefinition;
				const uri = vscode.Uri.file(goToDefinition.fs_file_path);
				const startPosition = new vscode.Position(goToDefinition.range.startPosition.line, goToDefinition.range.startPosition.character);
				const endPosition = new vscode.Position(goToDefinition.range.endPosition.line, goToDefinition.range.endPosition.character);
				const range = new vscode.Range(startPosition, endPosition);
				response.location({ uri, range, name: symbol_identifier.symbol_name, thinking: goToDefinition.thinking });
				continue;
			} else if (symbolEventSubStep.Edit) {
				const editEvent = symbolEventSubStep.Edit;
				if (editEvent.RangeSelectionForEdit) {
					response.codeEditPreview({
						reference: {
							uri: vscode.Uri.file(symbol_identifier.fs_file_path),
							name: symbol_identifier.symbol_name
						},
						ranges: [new vscode.Range(
							new vscode.Position(editEvent.RangeSelectionForEdit.range.startPosition.line, editEvent.RangeSelectionForEdit.range.startPosition.character),
							new vscode.Position(editEvent.RangeSelectionForEdit.range.endPosition.line, editEvent.RangeSelectionForEdit.range.endPosition.character)
						)]
					});
				}
			} else if (symbolEventSubStep.Probe) {
				const probeSubStep = symbolEventSubStep.Probe;
				const probeRequestKeys = Object.keys(probeSubStep) as (keyof typeof symbolEventSubStep.Probe)[];
				if (!symbol_identifier.fs_file_path || probeRequestKeys.length === 0) {
					continue;
				}

				const subStepType = probeRequestKeys[0];
				if (editMode && subStepType === 'ProbeAnswer' && probeSubStep.ProbeAnswer !== undefined) {
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
		} else if (event.event.RequestEvent) {
			const { ProbeFinished } = event.event.RequestEvent;
			if (!ProbeFinished) {
				continue;
			}

			const { reply } = ProbeFinished;
			if (reply === null) {
				continue;
			}

			// The sidecar currently sends '<symbolName> at <fileName>' at the start of the response. Remove it.
			const match = reply.match(pattern);
			if (match) {
				const suffix = match[2].trim();
				response.markdown(suffix);
			} else {
				response.markdown(reply);
			}

			break;
		}
	}

	// logStream.write(']');
	// logStream.end();
};
