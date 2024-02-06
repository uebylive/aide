/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import detectIndent from 'detect-indent'
import type { TextDocument } from 'vscode'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { endsWithBlockStart } from '../detect-multiline'
import { insertIntoDocContext, type DocumentContext } from '../get-current-doc-context'
import { getLastLine } from '../text-processing'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import {
	processCompletion,
	type InlineCompletionItemWithAnalytics,
} from '../text-processing/process-inline-completions'

import { getDynamicMultilineDocContext } from './dynamic-multiline'
import type {
	FetchAndProcessCompletionsParams,
	FetchCompletionResult,
} from './fetch-and-process-completions'
import { getEditorIndentString } from '../format-completion'

interface HotStreakExtractorParams extends FetchAndProcessCompletionsParams {
	completedCompletion: InlineCompletionItemWithAnalytics
}

export const STOP_REASON_HOT_STREAK = 'aide-hot-streak'

export interface HotStreakExtractor {
	extract(rawCompletion: string, isRequestEnd: boolean): Generator<FetchCompletionResult>
}

export function pressEnterAndGetIndentString(
	insertText: string,
	currentLine: string,
	document: TextDocument
): string {
	const { languageId, uri } = document

	const startsNewBlock = Boolean(endsWithBlockStart(insertText, languageId))
	const newBlockIndent = startsNewBlock ? getEditorIndentString(uri) : ''
	const currentIndentReference = insertText.includes('\n') ? getLastLine(insertText) : currentLine

	return '\n' + detectIndent(currentIndentReference).indent + newBlockIndent
}

/**
 * For a hot streak, we require the completion to be inserted followed by an enter key
 * Enter will usually insert a line break followed by the same indentation that the
 * current line has.
 */
function insertCompletionAndPressEnter(
	docContext: DocumentContext,
	completion: InlineCompletionItemWithAnalytics,
	document: TextDocument,
	dynamicMultilineCompletions: boolean
): DocumentContext {
	const { insertText } = completion

	const indentString = pressEnterAndGetIndentString(insertText, docContext.currentLinePrefix, document)
	const insertTextWithPressedEnter = insertText + indentString

	const updatedDocContext = insertIntoDocContext({
		docContext,
		languageId: document.languageId,
		insertText: insertTextWithPressedEnter,
		dynamicMultilineCompletions,
	})

	return updatedDocContext
}

export function createHotStreakExtractor(params: HotStreakExtractorParams): HotStreakExtractor {
	const { completedCompletion, providerOptions } = params
	const {
		docContext,
		document,
		document: { languageId },
		dynamicMultilineCompletions = false,
	} = providerOptions

	let updatedDocContext = insertCompletionAndPressEnter(
		docContext,
		completedCompletion,
		document,
		dynamicMultilineCompletions
	)

	function* extract(rawCompletion: string, isRequestEnd: boolean): Generator<FetchCompletionResult> {
		while (true) {
			const unprocessedCompletion = rawCompletion.slice(
				updatedDocContext.injectedCompletionText?.length || 0
			)

			if (unprocessedCompletion.length === 0) {
				return undefined
			}

			const extractCompletion = isRequestEnd ? parseAndTruncateCompletion : canUsePartialCompletion

			const maybeDynamicMultilineDocContext = {
				...updatedDocContext,
				...(dynamicMultilineCompletions && !updatedDocContext.multilineTrigger
					? getDynamicMultilineDocContext({
						languageId,
						docContext: updatedDocContext,
						insertText: unprocessedCompletion,
					})
					: {}),
			}

			const completion = extractCompletion(unprocessedCompletion, {
				document,
				docContext: maybeDynamicMultilineDocContext,
				isDynamicMultilineCompletion: Boolean(dynamicMultilineCompletions),
			})

			if (completion && completion.insertText.trim().length > 0) {
				// If the partial completion logic finds a match, extract this as the next hot
				// streak...
				// ... if not and we are processing the last payload, we use the whole remainder for the
				// completion (this means we will parse the last line even when a \n is missing at
				// the end) ...
				const processedCompletion = processCompletion(completion, {
					document,
					position: maybeDynamicMultilineDocContext.position,
					docContext: maybeDynamicMultilineDocContext,
				})

				yield {
					docContext: updatedDocContext,
					completion: {
						...processedCompletion,
						stopReason: STOP_REASON_HOT_STREAK,
					},
				}

				updatedDocContext = insertCompletionAndPressEnter(
					updatedDocContext,
					processedCompletion,
					document,
					dynamicMultilineCompletions
				)
			} else {
				// ... otherwise we don't have enough in the remaining completion text to generate a full
				// hot-streak completion and yield to wait for the next chunk (or abort).
				return undefined
			}
		}
	}

	return {
		extract,
	}
}
