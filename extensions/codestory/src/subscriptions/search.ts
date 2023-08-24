/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	ExtensionContext,
	OutputChannel,
	Uri,
	commands,
	workspace,
	Range,
	Position,
	window,
	env,
} from 'vscode';
import { CodeStoryViewProvider } from '../providers/codeStoryView';
import { TSMorphProjectManagement } from '../utilities/parseTypescript';
import { MessageHandlerData } from '@estruyf/vscode';
import postHogClient from '../posthog/client';
import { EmbeddingsSearch } from '../codeGraph/embeddingsSearch';
import { getHighlighter, BUNDLED_THEMES, Theme } from 'shiki';
import { Logger } from 'winston';
import { SearchState, OpenFileState } from '../types';

const workbenchConfig = workspace.getConfiguration('workbench');
let workbenchTheme = workbenchConfig.get('colorTheme') as Theme;
if (!BUNDLED_THEMES.includes(workbenchTheme)) {
	workbenchTheme = 'github-dark';
}
const highlighter = getHighlighter({ theme: workbenchTheme });

async function getCodeByLineRange(
	filePath: string,
	startLine: number,
	endLine: number
): Promise<{ languageId: string; code: string } | null> {
	try {
		const fileUri = Uri.file(filePath);
		const document = await workspace.openTextDocument(fileUri);
		// VSCode lines are 0-indexed so we subtract 1 from startLine and endLine
		const textLines = document.getText(
			new Range(new Position(startLine - 1, 0), new Position(endLine - 1, Number.MAX_SAFE_INTEGER))
		);
		return { languageId: document.languageId, code: textLines };
	} catch (err) {
		console.error(err);
		return null;
	}
}

export const search = (
	provider: CodeStoryViewProvider,
	embeddingIndex: EmbeddingsSearch,
	repoName: string,
	repoHash: string
) => {
	return commands.registerCommand(
		'codestory.search',
		async ({ payload, ...message }: MessageHandlerData<SearchState>) => {
			const searchResults: {
				matchedCode: string;
				filePath: string;
				lineStart: number;
				lineEnd: number;
				languageId?: string;
			}[] = [];
			const { prompt } = payload;
			postHogClient.capture({
				distinctId: env.machineId,
				event: 'search',
				properties: {
					prompt,
					repoName,
					repoHash,
				},
			});
			const closestSymbols = await embeddingIndex.generateNodesRelevantForUser(prompt);
			console.log('[search] Whats the length of closest symbols: ' + closestSymbols.length);
			for (const matchedCodeSymbol of closestSymbols) {
				const highlighterResolved = await highlighter;
				const highlightedCode = highlighterResolved.codeToHtml(
					matchedCodeSymbol.codeSymbolInformation.codeSnippet.code,
					{
						lang: matchedCodeSymbol.codeSymbolInformation.codeSnippet.languageId,
					}
				);
				const newMatch = {
					matchedCode: highlightedCode,
					filePath: matchedCodeSymbol.codeSymbolInformation.fsFilePath,
					lineStart: matchedCodeSymbol.codeSymbolInformation.symbolStartLine,
					lineEnd: matchedCodeSymbol.codeSymbolInformation.symbolEndLine,
				};
				searchResults.push(newMatch);
			}
			const responseData = {
				...message,
				payload: { results: searchResults },
			};
			provider.getView()?.webview.postMessage(responseData);
		}
	);
};

export const openFile = (logger: Logger) => {
	return commands.registerCommand(
		'codestory.openFile',
		async ({ payload }: MessageHandlerData<OpenFileState>) => {
			const { filePath, lineStart } = payload;
			const fileUri = Uri.file(filePath);
			logger.info('Opening file: ' + fileUri.toString());
			logger.info('Opening file: ' + fileUri.toString());

			try {
				logger.info(`[open-file] Whats the line start ${JSON.stringify(lineStart)}`);
				const document = await workspace.openTextDocument(fileUri);
				logger.info(`[open-file] Whats the line start ${JSON.stringify(lineStart)}`);
				await window.showTextDocument(document, {
					selection: new Range(new Position(lineStart - 1, 0), new Position(lineStart - 1, 0)),
					preserveFocus: false,
					preview: false,
				});
			} catch (err) {
				logger.error('Error opening file: ' + (err as Error).toString());
			}
		}
	);
};
