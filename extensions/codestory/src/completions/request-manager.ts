/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { partition } from 'lodash';
import { LRUCache } from 'lru-cache';
import type * as vscode from 'vscode';
import { Range } from 'vscode';


import type { DocumentContext } from './get-current-doc-context';
import * as CompletionLogger from './logger';
import {
	InlineCompletionsResultSource,
	type LastInlineCompletionCandidate,
} from './get-inline-completions';
import { logCompletionBookkeepingEvent, type CompletionLogID } from './logger';
import { reuseLastCandidate } from './reuse-last-candidate';
import {
	processInlineCompletions,
	type InlineCompletionItemWithAnalytics,
} from './text-processing/process-inline-completions';
import { getPositionAfterTextInsertion, getPositionAfterTextInsertionSameLine, lines, removeIndentation } from './text-processing';
import { SideCarClient } from '../sidecar/client';
import { Provider } from './providers/provider';
import { STOP_REASON_HOT_STREAK } from './providers/hot-streak';

export const isDefined = <T>(value: T): value is NonNullable<T> => value !== undefined && value !== null;

export interface RequestParams {
	/** The request's document */
	document: vscode.TextDocument;

	/** The request's document context */
	docContext: DocumentContext;

	/** The state of the completion info box */
	selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined;

	/** The cursor position in the source file where the completion request was triggered. */
	position: vscode.Position;

	/** The abort signal for the request. */
	abortSignal?: AbortSignal;
}

export interface RequestManagerResult {
	completions: InlineCompletionItemWithAnalytics[];
	source: InlineCompletionsResultSource;
}

interface RequestsManagerParams {
	requestParams: RequestParams;
	isCacheEnabled: boolean;
	provider: Provider;
	logger: CompletionLogger.LoggingService,
	spanId: string,
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 *
 * It also retests the request against the completion result of an inflight
 * request that just resolved and uses the last candidate logic to synthesize
 * completions if possible.
 */
export class RequestManager {
	private cache = new RequestCache();
	private completionCache: string | undefined = undefined;
	private previousRequest: AbortController | undefined = undefined;
	private sidecarClient: SideCarClient;
	private readonly inflightRequests: Set<InflightRequest> = new Set();
	// Tracks the last request that the request manager is called with. We use this to evaluate
	// the relevance of existing requests (i.e to find out if the generations are still relevant)
	private latestRequestParams: null | RequestsManagerParams = null;

	constructor(sidecarClient: SideCarClient) {
		this.sidecarClient = sidecarClient;
	}

	public checkCache(
		params: Pick<RequestsManagerParams, 'requestParams' | 'isCacheEnabled' | 'logger' | 'spanId'>
	): RequestManagerResult | null {
		const { requestParams, isCacheEnabled, logger, spanId } = params
		const cachedCompletions = this.cache.get(requestParams)

		if (isCacheEnabled && cachedCompletions) {
			logger.logInfo('sidecar.request_manager.cache_hit', {
				'event_name': 'sidecar.request_manager.cache_hit',
				'id': spanId,
			});
			// addAutocompleteDebugEvent('RequestManager.checkCache', { cachedCompletions })
			return cachedCompletions
		}
		return null
	}

	public async requestPlain(params: RequestsManagerParams): Promise<RequestManagerResult> {
		// logic here is the following:
		// we want to resolve the promise for the user properly and keep stremaing it back
		// but since we are yielding it line by line, it could happen that the user has
		// typed a bit forward or something, so we can lookup our cache here and check
		// if what the user has typed matches with the cache
		// the other thing to keep in mind is that the user always wants to accept one
		// line and then move to the next, partial one liners make no sense, at the very
		// least the user will get the experience that its streaming back properly
		const { requestParams, provider, logger, spanId } = params;
		// now we need to check if we have prefix overlap with the other completion which are running around
		const prefix = requestParams.docContext.prefix;
		const completionCacheString = this.completionCache;
		const currentPosition = requestParams.position;
		if (completionCacheString) {
			const equalStart = completionCacheString.startsWith(prefix);
			if (equalStart) {
				// we have a prefix overlap, find the index of this and then return it
				const remainingCompletion = completionCacheString.substring(prefix.length);
				logger.logInfo('sidecar.request.plain.cached', {
					'event_name': 'sidecar.request.plain.cached.hit',
					'completion': remainingCompletion,
					'completion_cache': completionCacheString,
					'prefix': prefix,
					'id': spanId,
				});
				return {
					completions: [{
						insertText: remainingCompletion,
						range: new Range(currentPosition, getPositionAfterTextInsertionSameLine(currentPosition, remainingCompletion)),
					}],
					source: InlineCompletionsResultSource.Cache,
				}
			} else {
				// we should terminate the running request in the background as its not useful anymore
				// and set our cache to empty right here and then start a new request
				if (this.previousRequest) {
					// we are aborting the previous running request here
					this.previousRequest.abort();
					this.completionCache = undefined;
				}
			}
		}
		const abortController = new AbortController();
		this.previousRequest = abortController;
		this.completionCache = '';
		let request = new InflightRequest(requestParams, abortController);
		// lets assume that there is no cache for now, we will add it back later
		const generateCompletions = async (): Promise<void> => {
			try {
				for await (const fetchCompletionResults of provider.generateCompletionsPlain(
					request.abortController.signal,
				)) {
					// we are going to get the generations back, here we will keep adding them to the cache
					// one per line
					const stopReason = fetchCompletionResults.stopReason;
					const currentCompletion = fetchCompletionResults.completion;
					// First add it to the cache so we can look it up later
					this.completionCache = prefix + currentCompletion;
					logger.logInfo('sidecar.request.plain.generate_completions', {
						'event_name': 'sidecar.request.plain.generate_completions',
						'completion': currentCompletion,
						'id': spanId,
					});
					request.resolve({
						completions: [{
							insertText: currentCompletion,
							range: new Range(currentPosition, getPositionAfterTextInsertionSameLine(currentPosition, currentCompletion))
						}],
						source: InlineCompletionsResultSource.Network,
					});
				}
			} catch (error) {
				request.reject(error as Error);
			} finally {
				this.inflightRequests.delete(request);
			}
		};
		generateCompletions();
		return request.promise;
	}

	// We are internally caching the results here with the hotstreak etc
	// we should carefully check why the hotstreak is not getting hits
	public async request(params: RequestsManagerParams): Promise<RequestManagerResult> {
		this.latestRequestParams = params;

		const { requestParams, isCacheEnabled, provider, logger, spanId } = params;

		// The cache is checked incorrectly over here, we should check it here
		// if we can keep the cache updated along with the characters and the completion
		// for some reason we are not returning the correct thing here as we might have
		// swiped and updated.
		// but in other cases it does not work properly
		const cachedCompletions = this.cache.get(requestParams);
		if (isCacheEnabled && cachedCompletions) {
			return cachedCompletions;
		}

		// When request recycling is enabled, we do not pass the original abort signal forward as to
		// not interrupt requests that are no longer relevant. Instead, we let all previous requests
		// complete and try to see if their results can be reused for other inflight requests.
		const abortController: AbortController = new AbortController();

		const request = new InflightRequest(requestParams, abortController);
		this.inflightRequests.add(request);

		const generateCompletions = async (): Promise<void> => {
			try {
				// here we are waiting for the sidecar to return the completions, not really
				// we do some parsing and generate more completions
				for await (const fetchCompletionResults of provider.generateCompletions(
					request.abortController.signal,
				)) {
					const [hotStreakCompletions, currentCompletions] = partition(
						fetchCompletionResults.filter(isDefined),
						result => result.completion.stopReason === STOP_REASON_HOT_STREAK
					);

					logger.logInfo('sidecar.request_manager.current.completions', {
						event_name: 'sidecar.request_manager.current.completions',
						'id': spanId,
						'completion': currentCompletions.length,
					});

					logger.logInfo('sidecar.request_manager.hotstreak.completions', {
						event_name: 'sidecar.request_manager.hotstreak.completions',
						'id': spanId,
						'completions': hotStreakCompletions.length,
					});


					if (currentCompletions.length > 0) {
						// Process regular completions that will shown to the user.
						const completions = currentCompletions.map(result => result.completion);

						// Shared post-processing logic
						const processedCompletions = processInlineCompletions(completions, requestParams);

						// Cache even if the request was aborted or already fulfilled.
						this.cache.set(requestParams, {
							completions: processedCompletions,
							source: InlineCompletionsResultSource.Cache,
						});

						// A promise will never resolve twice, so we do not need to
						// check if the request was already fulfilled.
						request.resolve({
							completions: processedCompletions,
							source: InlineCompletionsResultSource.Network,
						});

						request.lastCompletions = processedCompletions;
						this.testIfResultCanBeRecycledForInflightRequests(request, processedCompletions);
					}

					// Save hot streak completions for later use.
					for (const result of hotStreakCompletions) {
						request.lastRequestParams = {
							...request.lastRequestParams,
							docContext: result.docContext,
						};
						request.lastCompletions = [result.completion];
						this.cache.set(
							{ docContext: result.docContext },
							{
								completions: [result.completion],
								source: InlineCompletionsResultSource.HotStreak,
							}
						);
					}

					this.cancelIrrelevantRequests(logger, spanId);
				}
			} catch (error) {
				request.reject(error as Error);
			} finally {
				this.inflightRequests.delete(request);
			}
		};

		this.cancelIrrelevantRequests(logger, spanId);

		generateCompletions();
		return request.promise;
	}

	public removeFromCache(params: RequestParams): void {
		this.cache.delete(params);
	}

	/**
	 * Test if the result can be used for inflight requests. This only works
	 * if a completion is a forward-typed version of a previous completion.
	 */
	private testIfResultCanBeRecycledForInflightRequests(
		resolvedRequest: InflightRequest,
		items: InlineCompletionItemWithAnalytics[]
	): void {
		const { document, position, docContext, selectedCompletionInfo } = resolvedRequest.params;
		const lastCandidate: LastInlineCompletionCandidate = {
			uri: document.uri,
			lastTriggerPosition: position,
			lastTriggerDocContext: docContext,
			lastTriggerSelectedCompletionInfo: selectedCompletionInfo,
			result: {
				logId: '' as CompletionLogID,
				source: InlineCompletionsResultSource.Network,
				items,
			},
		};

		for (const request of this.inflightRequests) {
			if (request === resolvedRequest) {
				continue;
			}

			if (request.params.document.uri.toString() !== document.uri.toString()) {
				continue;
			}

			const synthesizedCandidate = reuseLastCandidate({
				document: request.params.document,
				position: request.params.position,
				lastCandidate,
				docContext: request.params.docContext,
				selectedCompletionInfo: request.params.selectedCompletionInfo,
			});

			if (synthesizedCandidate) {
				const synthesizedItems = synthesizedCandidate.items;

				logCompletionBookkeepingEvent('synthesizedFromParallelRequest');
				request.resolve({
					completions: synthesizedItems,
					source: InlineCompletionsResultSource.CacheAfterRequestStart,
				});
				request.abortController.abort();
				this.inflightRequests.delete(request);
			}
		}
	}

	private cancelIrrelevantRequests(logger: CompletionLogger.LoggingService, spanId: string): void {
		if (!this.latestRequestParams) {
			return;
		}

		// Here we need to call the sidecar instead and abort the inflight request
		const isLocalProvider = true;
		// const isLocalProvider = isLocalCompletionsProvider(this.latestRequestParams.provider.options.id)

		for (const request of this.inflightRequests) {
			let shouldAbort = !computeIfRequestStillRelevant(
				this.latestRequestParams.requestParams,
				request.lastRequestParams,
				request.lastCompletions
			);

			if (isLocalProvider) {
				shouldAbort =
					this.latestRequestParams.requestParams.docContext.currentLinePrefix !==
					request.params.docContext.currentLinePrefix;
			}

			if (shouldAbort) {
				logger.logInfo('sidecar.cancelIrrelevantRequests', {
					'event_name': 'cancel_irrelevant_requests',
					'request_id_reason': spanId,
					// TODO(skcd): We do not trust this, but lets keep it for now
					'request_id_broken_do_not_trust': spanId,
				});
				request.abortController.abort();
				this.inflightRequests.delete(request);
			}
		}
	}
}

class InflightRequest {
	public promise: Promise<RequestManagerResult>;
	public resolve: (result: RequestManagerResult) => void;
	public reject: (error: Error) => void;

	// Remember the latest completion candidates emitted by an inflight request. This is necessary
	// since we want to detect when a completion generation is diverging from the current document
	// context in order to effectively abort it.
	public lastCompletions: InlineCompletionItemWithAnalytics[] | null = null;
	public lastRequestParams: RequestParams;

	constructor(
		public params: RequestParams,
		public abortController: AbortController
	) {
		// The promise constructor is called synchronously, so this is just to
		// make TS happy
		this.resolve = () => { };
		this.reject = () => { };

		this.lastRequestParams = params;

		this.promise = new Promise<RequestManagerResult>((res, rej) => {
			this.resolve = res;
			this.reject = rej;
		});
	}
}

interface RequestCacheItem {
	completions: InlineCompletionItemWithAnalytics[];
	source: InlineCompletionsResultSource;
}
class RequestCache {
	private cache = new LRUCache<string, RequestCacheItem>({
		max: 50,
	});

	private toCacheKey(key: Pick<RequestParams, 'docContext'>): string {
		return `${key.docContext.prefix}█${key.docContext.nextNonEmptyLine}`;
	}

	public get(key: RequestParams): RequestCacheItem | undefined {
		return this.cache.get(this.toCacheKey(key));
	}

	public set(key: Pick<RequestParams, 'docContext'>, item: RequestCacheItem): void {
		this.cache.set(this.toCacheKey(key), item);
	}

	public delete(key: RequestParams): void {
		this.cache.delete(this.toCacheKey(key));
	}
}

// Given the current document and a previous request with it's recommended completions, compute if
// the completion is still relevant for the current document.
//
// We define a completion suggestion as still relevant if the prefix still overlap with the new new
// completion while allowing for some slight changes to account for prefixes.
export function computeIfRequestStillRelevant(
	currentRequest: Pick<RequestParams, 'docContext'> & { document: { uri: vscode.Uri } },
	previousRequest: Pick<RequestParams, 'docContext'> & { document: { uri: vscode.Uri } },
	completions: InlineCompletionItemWithAnalytics[] | null
): boolean {
	if (currentRequest.document.uri.toString() !== previousRequest.document.uri.toString()) {
		return false;
	}

	const currentPrefixStartLine =
		currentRequest.docContext.position.line - (lines(currentRequest.docContext.prefix).length - 1);
	const previousPrefixStartLine =
		previousRequest.docContext.position.line - (lines(previousRequest.docContext.prefix).length - 1);

	const sharedStartLine = Math.max(currentPrefixStartLine, previousPrefixStartLine);

	// Truncate both prefixes to ensure they start at the same line
	const currentPrefixDiff = sharedStartLine - currentPrefixStartLine;
	const previousPrefixDiff = sharedStartLine - previousPrefixStartLine;
	if (currentPrefixDiff < 0 || previousPrefixDiff < 0) {
		// There is no overlap in prefixes, the completions are not relevant
		return false;
	}
	const currentPrefix = currentRequest.docContext.prefix
		.split('\n')
		.slice(currentPrefixDiff)
		.join('\n');

	const previousPrefix = previousRequest.docContext.prefix
		.split('\n')
		.slice(previousPrefixDiff)
		.join('\n');

	// Require some overlap in the prefixes
	if (currentPrefix === '' || previousPrefix === '') {
		return false;
	}

	const current = removeIndentation(currentPrefix);
	for (const completion of completions ?? [{ insertText: '' }]) {
		const inserted = removeIndentation(previousPrefix + completion.insertText);

		const isFullContinuation = inserted.startsWith(current) || current.startsWith(inserted);
		// We consider a completion still relevant if the prefixes and the continuation diverge up
		// to three characters. For this, we only consider typos in the last line (= the line at the
		// cursor position)
		const [insertedLines, insertedLastLine] = splitLastLine(inserted);
		const [currentLines, currentLastLine] = splitLastLine(current);
		const isTypo =
			insertedLines === currentLines && insertedLastLine.startsWith(currentLastLine.slice(0, -3));

		if (isFullContinuation || isTypo) {
			return true;
		}
	}

	return false;
}

function splitLastLine(text: string): [string, string] {
	const lines = text.split('\n');
	const lastLine = lines.pop()!;
	return [lines.join('\n'), lastLine];
}
