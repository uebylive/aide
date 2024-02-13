/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionStopReason } from '../../sidecar/client';
import { canUsePartialCompletion } from '../can-use-partial-completion';
import type { DocumentContext } from '../get-current-doc-context';
import { getFirstLine } from '../text-processing';
import * as CompletionLogger from '../logger';
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion';
import {
	processCompletion,
	type InlineCompletionItemWithAnalytics,
} from '../text-processing/process-inline-completions';

import { getDynamicMultilineDocContext } from './dynamic-multiline';
import { createHotStreakExtractor, type HotStreakExtractor } from './hot-streak';
import type { ProviderOptions } from './provider';

export interface StreamCompletionResponse {
	completion: string;
	stopReason: string;
}

export interface FetchAndProcessCompletionsParams {
	abortController: AbortController;
	completionResponseGenerator: AsyncIterable<StreamCompletionResponse>;
	providerSpecificPostProcess: (insertText: string) => string;
	providerOptions: Readonly<ProviderOptions>;
	logger: CompletionLogger.LoggingService,
	spanId: string;
}

/**
 * Uses the first line of the completion to figure out if it start the new multiline syntax node.
 * If it does, continues streaming until the completion is truncated or we reach the token sample limit.
 */
export async function* fetchAndProcessDynamicMultilineCompletions(
	params: FetchAndProcessCompletionsParams
): FetchCompletionsGenerator {
	const {
		completionResponseGenerator,
		abortController,
		providerOptions,
		providerSpecificPostProcess,
		logger,
		spanId,
	} = params;
	const { hotStreak, docContext, multiline, firstCompletionTimeout } = providerOptions;

	let hotStreakExtractor: undefined | HotStreakExtractor;

	interface StopParams {
		completedCompletion: InlineCompletionItemWithAnalytics;
		rawCompletion: string;
		isFullResponse: boolean;
	}

	function* stopStreamingAndUsePartialResponse(
		stopParams: StopParams
	): Generator<FetchCompletionResult> {
		const { completedCompletion, rawCompletion, isFullResponse } = stopParams;
		yield {
			docContext,
			completion: {
				...completedCompletion,
				stopReason: isFullResponse ? completedCompletion.stopReason : 'streaming-truncation',
			},
		};

		if (hotStreak) {
			hotStreakExtractor = createHotStreakExtractor({
				completedCompletion,
				...params,
			});

			yield* hotStreakExtractor.extract(rawCompletion, isFullResponse);
		} else {
			abortController.abort();
		}
	}

	const generatorStartTime = performance.now();

	logger.logInfo('sidecar.completion_request.generator', {
		event_name: 'sidecar.completion_request.generator',
		id: spanId,
	});
	for await (const { completion, stopReason } of completionResponseGenerator) {
		const isFirstCompletionTimeoutElapsed =
			performance.now() - generatorStartTime >= firstCompletionTimeout;
		const isFullResponse = stopReason !== CompletionStopReason.StreamingChunk;
		const shouldYieldFirstCompletion = isFullResponse || isFirstCompletionTimeoutElapsed;
		logger.logInfo('sidecar.shouldYieldFirstCompletion', {
			'event_name': 'should_yield_first_completion',
			'should_yield_first_completion': shouldYieldFirstCompletion,
			'multiline': multiline,
			'completion': completion,
			"hotStreakExtractor": hotStreakExtractor !== undefined ? "present" : "not_present",
		});

		const extractCompletion = shouldYieldFirstCompletion
			? parseAndTruncateCompletion
			: canUsePartialCompletion;
		const rawCompletion = providerSpecificPostProcess(completion);
		// console.log('sidecar.rawCompletion', rawCompletion);

		// this is terminating cases where we have completions like \n console.log('something')
		// the condition here is that the first line is empty and we didn't reach the first completion timeout
		// but this is wrong because we might have completions like \n console.log('something')
		// and we do want to yield it.
		// TODO(skcd): we might have an issue here with the end of line treatement, if we are
		// towards the end of the line and we have a completion like \n console.log('something')
		// we will terminate here in the case that the timeout for the file line is pretty large
		// and because it starts with a \n, so lets remove it for now.
		// if (!getFirstLine(rawCompletion) && !shouldYieldFirstCompletion) {
		// 	console.log('sidecar.getFirstLine', 'empty-string');
		// 	continue;
		// }

		if (hotStreakExtractor) {
			yield* hotStreakExtractor.extract(rawCompletion, isFullResponse);
			continue;
		}

		/**
		 * This completion was triggered with the multiline trigger at the end of current line.
		 * Process it as the usual multiline completion: continue streaming until it's truncated.
		 * Note: This is always true for now, but we might want to change that in the future.
		 */
		if (multiline) {
			// console.log('sidecar.streaming.multiline', true);
			// extractCompletion here is always canUsePartialCompletion
			const completion = extractCompletion(rawCompletion, {
				document: providerOptions.document,
				docContext,
				isDynamicMultilineCompletion: false,
				logger,
				spanId,
			});
			logger.logInfo('sidecar.multiline.completion_extract', {
				event_name: 'sidecar.multiline.completion_extract',
				completion: completion,
				raw_completion: rawCompletion,
			});

			// console.log('sidecar.streaming.multiline.completion.is_null', completion !== null);

			if (completion) {
				const completedCompletion = processCompletion(completion, providerOptions);
				// console.log('sidecarCompletion.completion.multiline.completion', completedCompletion.insertText);
				yield* stopStreamingAndUsePartialResponse({
					completedCompletion,
					isFullResponse,
					rawCompletion,
				});
			}

			continue;
		}

		logger.logInfo('sidecar.DO_NOT_LOG', {
			event_name: 'DO_NOT_LOG_EVER',
			id: spanId,
		});

		// we are not going below this at all, cause we enabled multiline by default
		// console.log('sidecar.DO_NOT_LOG');
		/**
		 * This completion was started without the multiline trigger at the end of current line.
		 * Check if the the first completion line ends with the multiline trigger. If that's the case
		 * continue streaming and pretend like this completion was multiline in the first place:
		 *
		 * 1. Update `docContext` with the `multilineTrigger` value.
		 * 2. Set the cursor position to the multiline trigger.
		 */
		const dynamicMultilineDocContext = {
			...docContext,
			...getDynamicMultilineDocContext({
				docContext,
				languageId: providerOptions.document.languageId,
				insertText: rawCompletion,
			}),
		};

		if (dynamicMultilineDocContext.multilineTrigger && !isFirstCompletionTimeoutElapsed) {
			const completion = extractCompletion(rawCompletion, {
				document: providerOptions.document,
				docContext: dynamicMultilineDocContext,
				isDynamicMultilineCompletion: true,
				logger,
				spanId,
			});

			if (completion) {
				const completedCompletion = processCompletion(completion, {
					document: providerOptions.document,
					position: dynamicMultilineDocContext.position,
					docContext: dynamicMultilineDocContext,
				});

				console.log('sidecarCompletion.completion', 'dynamic-multiline-completion');
				yield* stopStreamingAndUsePartialResponse({
					completedCompletion,
					isFullResponse,
					rawCompletion,
				});
			}
		} else {
			/**
			 * This completion was started without the multiline trigger at the end of current line
			 * and the first generated line does not end with a multiline trigger.
			 *
			 * Process this completion as a singleline completion: cut-off after the first new line char.
			 */
			const completion = extractCompletion(rawCompletion, {
				document: providerOptions.document,
				docContext,
				isDynamicMultilineCompletion: false,
				logger,
				spanId,
			});

			if (completion) {
				const firstLine = getFirstLine(completion.insertText);

				const completedCompletion = processCompletion(
					{
						...completion,
						insertText: firstLine,
					},
					providerOptions
				);

				console.log('sidecarCompletion.compltion', 'else-dynamic-multline-completion');
				yield* stopStreamingAndUsePartialResponse({
					isFullResponse,
					completedCompletion,
					rawCompletion,
				});
			}
		}
	}
}

export type FetchCompletionResult =
	| {
		docContext: DocumentContext;
		completion: InlineCompletionItemWithAnalytics;
	}
	| undefined;

type FetchCompletionsGenerator = AsyncGenerator<FetchCompletionResult>;

export async function* fetchAndProcessCompletions(
	params: FetchAndProcessCompletionsParams
): FetchCompletionsGenerator {
	const {
		completionResponseGenerator,
		abortController,
		providerOptions,
		providerSpecificPostProcess,
		logger,
		spanId,
	} = params;
	const { hotStreak, docContext } = providerOptions;

	let hotStreakExtractor: undefined | HotStreakExtractor;

	for await (const { stopReason, completion } of completionResponseGenerator) {
		const isFullResponse = stopReason !== CompletionStopReason.StreamingChunk;
		const rawCompletion = providerSpecificPostProcess(completion);

		if (hotStreakExtractor) {
			yield* hotStreakExtractor.extract(rawCompletion, isFullResponse);
			continue;
		}

		const extractCompletion = isFullResponse ? parseAndTruncateCompletion : canUsePartialCompletion;
		const parsedCompletion = extractCompletion(rawCompletion, {
			document: providerOptions.document,
			docContext,
			isDynamicMultilineCompletion: false,
			logger,
			spanId,
		});

		if (parsedCompletion) {
			const completedCompletion = processCompletion(parsedCompletion, providerOptions);

			yield {
				docContext,
				completion: {
					...completedCompletion,
					stopReason: isFullResponse ? stopReason : 'streaming-truncation',
				},
			};

			if (hotStreak) {
				hotStreakExtractor = createHotStreakExtractor({
					completedCompletion,
					...params,
				});

				yield* hotStreakExtractor?.extract(rawCompletion, isFullResponse);
			} else {
				abortController.abort();
				break;
			}
		}
	}
}
