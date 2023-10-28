/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * We are going to report the stream of responses we get back from sidecar to
 * the schema which is required for the editor session provider to work
 */

import * as vscode from 'vscode';
import { InLineAgentAction, InLineAgentAnswer, InLineAgentMessage } from '../sidecar/types';
import { RepoRef, SideCarClient } from '../sidecar/client';
import { CSInteractiveEditorProgressItem, IndentStyle, IndentationHelper } from './editorSessionProvider';

export const reportFromStreamToEditorSessionProgress = async (
	stream: AsyncIterator<InLineAgentMessage>,
	progress: vscode.Progress<vscode.CSChatEditorProgressItem>,
	cancellationToken: vscode.CancellationToken,
	currentRepoRef: RepoRef,
	workingDirectory: string,
	sidecarClient: SideCarClient,
	language: string,
	textDocument: vscode.TextDocument,
): Promise<string> => {
	if (cancellationToken.isCancellationRequested) {
		return '';
	}
	const firstPartOfMessage = async () => {
		const firstPart = await stream.next();
		if (firstPart.done) {
			return CSInteractiveEditorProgressItem.normalMessage('Failed to fetch response');
		}
		const sessionId = firstPart.value.session_id;
		return CSInteractiveEditorProgressItem.normalMessage(`Session ID: ${sessionId}`);
	};

	progress.report(await firstPartOfMessage());

	if (cancellationToken.isCancellationRequested) {
		return '';
	}

	const asyncIterable = {
		[Symbol.asyncIterator]: () => stream
	};

	let enteredAnswerGenerationLoop = false;
	let skillUsed: InLineAgentAction | undefined = undefined;
	let generatedAnswer: InLineAgentAnswer | null = null;

	for await (const inlineAgentMessage of asyncIterable) {
		// Here we are going to go in a state machine like flow, where we are going
		// to stream back to the user whatever steps we get, and when we start
		// streaming the reply back, that's when we start sending TextEdit updates
		// to the editor
		const messageState = inlineAgentMessage.message_state;
		if (messageState === 'Pending') {
			// have a look at the steps here
			const stepsTaken = inlineAgentMessage.steps_taken;
			// take the last step and show that to the user, cause that's why
			// we got an update
			if (stepsTaken.length > 0) {
				const lastStep = stepsTaken[stepsTaken.length - 1];
				if (typeof lastStep === 'string') {
					// We are probably in an action, this is because of bad typing
					// on the server side, fix it later
					if (lastStep === 'Doc') {
						skillUsed = 'Doc';
						progress.report(CSInteractiveEditorProgressItem.documentationGeneration());
						continue;
					}
				}
				// @ts-ignore
				if ('DecideAction' in lastStep) {
					progress.report(CSInteractiveEditorProgressItem.normalMessage('Deciding action...'));
					continue;
				}
			}
		}
		if (messageState === 'StreamingAnswer') {
			enteredAnswerGenerationLoop = true;
			// We are now going to stream the answer, this is where we have to carefully
			// decide how we want to show the text edits on the UI
			if (skillUsed === 'Doc') {
				// for doc generation we just track the answer until we get the final
				// one and then apply it to the editor
				generatedAnswer = inlineAgentMessage.answer;
			}
		}
		// Here we have to parse the data properly and get the answer back, implement
		// the logic for generating the reply properly here
	}

	if (skillUsed === 'Doc' && generatedAnswer !== null) {
		// Here we will send over the updates
		const cleanedUpAnswer = extractCodeFromDocumentation(generatedAnswer.answer_up_until_now);
		console.log(cleanedUpAnswer);
		if (cleanedUpAnswer === null) {
			progress.report(CSInteractiveEditorProgressItem.normalMessage('Failed to parse the output'));
			return '';
		}
		const parsedComments = await sidecarClient.getParsedComments({
			language,
			source: cleanedUpAnswer,
		});
		console.log(parsedComments);
		if (parsedComments.documentation.length === 1) {
			// we can just show this snippet on top of the current expanded
			// block which has been selected
			// If this is the case, then we just have to check the indentation
			// style and apply the edits accordingly
			// 1. get the first line in the selection
			const selectionText = textDocument.getText(new vscode.Range(
				new vscode.Position(generatedAnswer.document_symbol?.start_position.line ?? 0, 0),
				new vscode.Position(generatedAnswer.document_symbol?.end_position.line ?? 0, 0)
			));
			const lines = selectionText.split(/\r\n|\r|\n/g);
			console.log('we are trying to get the indent style for original document');
			console.log('+++++\n' + selectionText + '\n++++');
			const originalDocIndentationStyle = IndentationHelper.getDocumentIndentStyle(lines, undefined);
			console.log(originalDocIndentationStyle);
			let originalDocIndentationLevel = ['', 0];
			if (lines.length > 0) {
				// get the style from the first line
				const firstLine = lines[0];
				originalDocIndentationLevel = IndentationHelper.guessIndentLevel(firstLine, originalDocIndentationStyle);
			}
			// Now that we have the indentation level, we can apply the edits accordingly
			const edits: vscode.TextEdit[] = [];
			const documentation = parsedComments.documentation[0];
			const documentationLines = documentation.split(/\r\n|\r|\n/g);
			const documentationIndentStyle = IndentationHelper.getDocumentIndentStyle(documentationLines, undefined);
			// Now we trim all the whitespace at the start of this line
			const fixedDocumentationLines = documentationLines.map((documentationLine) => {
				const generatedDocIndentation = IndentationHelper.guessIndentLevel(documentationLine, documentationIndentStyle);
				// Now I have to replace the indentation on the generated documentation with the one I have from the original text
				// - first I trim it
				const trimmedDocumentationLine = documentationLine.trim();
				// This is the indentation from the original document
				// @ts-ignore
				const indentationString = originalDocIndentationStyle.kind === IndentStyle.Tabs ? '\t' : ' '.repeat(originalDocIndentationStyle.indentSize).repeat(originalDocIndentationLevel[1]);
				// original document whitespace + original document indentation for the line we are going to put it above + comments if they have any indentation
				const fixedDocumentationLine = indentationString + trimmedDocumentationLine;
				return fixedDocumentationLine;
			});
			// Now I have the start position for this answer
			const startPosition = generatedAnswer.document_symbol?.start_position.line ?? 0;
			const textEdits: vscode.TextEdit[] = [];
			let finalDocumentationString = fixedDocumentationLines.join('\n');
			// It needs one more \n at the end of the input
			finalDocumentationString = finalDocumentationString + '\n';
			textEdits.push(vscode.TextEdit.insert(new vscode.Position(startPosition, 0), finalDocumentationString));
			console.log('how many text edits');
			console.log(textEdits);
			// we report back the edits
			progress.report({
				edits: textEdits,
			});
		} else {
			// we have to show the whole block as an edit
		}
	}
	return '';
};


export const extractCodeFromDocumentation = (input: string): string | null => {
	const codePattern = /\/\/ FILEPATH:.*?\n([\s\S]+?)```/;

	const match = input.match(codePattern);

	return match ? match[1].trim() : null;
};
