/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeSymbolChange, getCodeSymbolsChangedInSameBlockDescription } from './trackCodeSymbolChanges';
import { OpenAI } from 'openai';
import { Logger } from 'winston';
import { getOpenAIApiKey } from '../utilities/getOpenAIKey';

const openai = new OpenAI({
	apiKey: getOpenAIApiKey(),
});


interface CodeBlockChangeDescriptionForWebView {
	componentIdentifier: string;
	changeDescription: string;
}

const getLanguageId = (filePath: string): string | null => {
	// use the path library to get the file extension and figure out the
	// language id of the file
	const path = require('path');
	const fileExtension = path.extname(filePath);
	if (fileExtension === '.ts' || fileExtension === '.js' || fileExtension === '.jsx' || fileExtension === '.tsx') {
		return 'typescript';
	}
	if (fileExtension === '.py') {
		return 'python';
	}
	if (fileExtension === '.go') {
		return 'go';
	}
	return null;
};

export const generateChatCompletionWithGPT4 = async (messages: OpenAI.Chat.CreateChatCompletionRequestMessage[]) => {
	const completion = await openai.chat.completions.create({
		model: 'gpt-4',
		messages,
		max_tokens: 756,
	});
	const completionText = completion.choices[0].message?.content || '';
	return completionText;
};

export class CodeBlockChangeDescriptionGenerator {
	private lastUpdatedTimestamp: number;
	private lastUpdatedFilePath: string;
	private logger: Logger;

	constructor(logger: Logger) {
		this.lastUpdatedTimestamp = 0;
		this.lastUpdatedFilePath = '';
		this.logger = logger;
	}

	public async generateDescriptionOfCodeBlockChange(
		codeSymbolChanges: CodeSymbolChange[],
		filePathLastSaved: string,
	): Promise<{
		codeBlockChangeDescriptions: CodeBlockChangeDescriptionForWebView[];
	} | null> {
		const currentTimestamp = Date.now();
		// If the same file was updated less than 2 seconds ago, then we skip
		// generating the description again and move on
		if (currentTimestamp - this.lastUpdatedTimestamp < 2000 && this.lastUpdatedFilePath === filePathLastSaved) {
			return null;
		}
		this.lastUpdatedTimestamp = currentTimestamp;
		this.lastUpdatedFilePath = filePathLastSaved;

		// Now we have to generate the descriptions of the changes in the code
		// blocks
		// For this we first group the code symbol by their component identifier
		const codeSymbolsGroupedByComponentIdentifier = new Map<string, CodeSymbolChange[]>();
		for (const codeSymbolChange of codeSymbolChanges) {
			const componentIdentifier = codeSymbolChange.componentIdentifier;
			if (!codeSymbolsGroupedByComponentIdentifier.has(componentIdentifier)) {
				codeSymbolsGroupedByComponentIdentifier.set(componentIdentifier, []);
			}
			codeSymbolsGroupedByComponentIdentifier.get(componentIdentifier)!.push(codeSymbolChange);
		}
		// Now we generate the description of the code blocks
		const codeBlockChangeDescriptions: CodeBlockChangeDescriptionForWebView[] = [];
		for (const [componentIdentifier, codeSymbols] of codeSymbolsGroupedByComponentIdentifier) {
			const codeBlockChangeDescription = getCodeSymbolsChangedInSameBlockDescription(codeSymbols.map((codeSymbol) => {
				return {
					name: codeSymbol.codeSymbol.displayName,
					languageId: getLanguageId(codeSymbol.codeSymbol.fsFilePath) ?? 'not_known',
					diffPatch: codeSymbol.diffPatch,
					lastEditTime: codeSymbol.changeTime.getTime(),
				};
			}));
			this.logger.info('[codeBlockChangeDescriptionGenerator] Generated code block change description: ' + JSON.stringify(codeBlockChangeDescription));
			const descriptionOfChange = await generateChatCompletionWithGPT4(codeBlockChangeDescription);
			this.logger.info('[codeBlockChangeDescriptionGenerator][generateChatCompletionWithGPT4] Generated code block change description: ' + descriptionOfChange);
			codeBlockChangeDescriptions.push({
				componentIdentifier,
				changeDescription: JSON.parse(descriptionOfChange),
			});
		}
		return {
			codeBlockChangeDescriptions: codeBlockChangeDescriptions,
		};
	}
}
