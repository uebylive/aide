/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { createPatch } from 'diff';
import { OpenAI } from 'openai';
import { ExtensionContext, OutputChannel, workspace } from 'vscode';
import { CodeSymbolChange, CodeSymbolChangeType, TrackCodeSymbolChanges } from './trackCodeSymbolChanges';
import { stateManager } from '../utilities/stateManager';
import { CodeStoryViewProvider } from '../providers/codeStoryView';
import { TimeKeeper } from '../subscriptions/timekeeper';
import { CodeBlockChangeDescriptionGenerator } from './codeBlockChangeDescriptionGenerator';
import { Logger } from 'winston';
import { getOpenAIApiKey } from '../utilities/getOpenAIKey';


const openai = new OpenAI({
	apiKey: getOpenAIApiKey(),
});

// The data we need to send over to the webview for rendering the timeline
export interface CodeSymbolChangeWebView {
	name: string;
	startLine: number;
	endLine: number;
	changeType: CodeSymbolChangeType;
	filePath: string;
	workingDirectory: string;
	changeTime: Date;
	relativePath: string;
	componentIdentifier: string;
	commitIdentifier: string;
	displayName: string;
	diffPatch: string;
}

export const onDidOpenTextDocument = (
	context: ExtensionContext,
	logger: OutputChannel
) =>
	workspace.onDidOpenTextDocument((doc) => {
		stateManager(context).updateDocuments(doc.uri.fsPath, doc.getText());
	});

export const onTextDocumentChange = (context: ExtensionContext, logger: OutputChannel) => {
	const state = stateManager(context);
	return workspace.onDidSaveTextDocument(async (doc) => {
		const documents = state.getDocuments();
		console.log('something');
		if (doc.uri.fsPath in documents) {
			const checkpoint = new Date();
			const oldText = documents[doc.uri.fsPath] || '';
			const newText = doc.getText();
			console.log('something');

			const diff =
				`${checkpoint.toLocaleString('en-US')}\n` +
				createPatch(doc.uri.fsPath, oldText, newText) +
				'\n';

			state.setCheckpoint(checkpoint);
			state.appendChanges(diff);
			state.updateDocuments(doc.uri.fsPath, newText);
		}
	});
};

const codeSymbolChangeForWebview = (codeSymbolChanges: CodeSymbolChange[]): CodeSymbolChangeWebView[] => {
	const messageChanges: CodeSymbolChangeWebView[] = [];
	codeSymbolChanges.forEach((codeSymbolChange) => {
		messageChanges.push({
			name: codeSymbolChange.name,
			startLine: codeSymbolChange.codeSymbol.symbolStartLine,
			endLine: codeSymbolChange.codeSymbol.symbolEndLine,
			changeType: codeSymbolChange.changeType,
			filePath: codeSymbolChange.codeSymbol.fsFilePath,
			workingDirectory: codeSymbolChange.codeSymbol.workingDirectory,
			changeTime: codeSymbolChange.changeTime,
			relativePath: path.relative(
				codeSymbolChange.codeSymbol.workingDirectory,
				codeSymbolChange.codeSymbol.fsFilePath
			),
			componentIdentifier: codeSymbolChange.componentIdentifier,
			commitIdentifier: codeSymbolChange.commitIdentifier,
			displayName: codeSymbolChange.codeSymbol.displayName,
			diffPatch: codeSymbolChange.diffPatch,
		});
	});
	return messageChanges;
};

export const triggerCodeSymbolChange = async (
	provider: CodeStoryViewProvider,
	trackCodeSymbolChanges: TrackCodeSymbolChanges,
	timeKeeperFileSaved: TimeKeeper,
	documentWhichWasSaved: string,
	codeBlockDescriptionGenerator: CodeBlockChangeDescriptionGenerator,
	logger: Logger,
) => {
	if (!trackCodeSymbolChanges.statusUpdated) {
		logger.info('[timeline-debugging] status not updated yet');
		return;
	}
	if (!timeKeeperFileSaved.isInvocationAllowed(Date.now())) {
		logger.info('[timeline-debugging] invocation not allowed yet because of time difference');
		return;
	}
	const trackedCodeSymbolChanges = await trackCodeSymbolChanges.getTreeListOfChangesWeHaveToCommit(
		trackCodeSymbolChanges.getChangedCodeSymbols()
	);

	const messageChanges = codeSymbolChangeForWebview(trackedCodeSymbolChanges);

	logger.info(`[timeline-debugging] Got changelog ${JSON.stringify(messageChanges)}`);

	const view = provider.getView();
	if (view === undefined) {
		logger.info('no view present yet.....');
	}

	provider.getView()?.webview.postMessage({
		command: 'getChangeLog',
		payload: {
			changes: messageChanges,
		},
	});

	// Now we generate the descriptions of the changes in the code block and pass
	// it to the webview
	const changeDescriptionData = await codeBlockDescriptionGenerator.generateDescriptionOfCodeBlockChange(
		trackedCodeSymbolChanges, documentWhichWasSaved,
	);
	logger.info('[triggerCodeSymbolChange] Got change description data: ' + JSON.stringify(changeDescriptionData));
	if (changeDescriptionData) {
		provider.getView()?.webview.postMessage({
			command: 'getComponentChangeDescription',
			payload: {
				...changeDescriptionData,
			},
		});
	}
};
