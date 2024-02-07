/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';
import type { URI } from 'vscode-uri';


import { insertIntoDocContext, type DocumentContext } from './get-current-doc-context';
import * as CompletionLogger from './logger';
import type { CompletionLogID } from './logger';
import type { RequestManager, RequestParams } from './request-manager';
import { reuseLastCandidate } from './reuse-last-candidate';
import type { AutocompleteItem } from './suggested-autocomplete-items-cache';
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions';
import { completionProviderConfig } from './completion-provider-config';
import { CompletionIntent } from './artificial-delay';
import { SideCarClient } from '../sidecar/client';
import { SidecarProvider } from './providers/sidecarProvider';

/**
 * Checks if the given file uri has a valid test file name.
 * @param uri - The file uri to check
 *
 * Removes file extension and checks if file name starts with 'test' or
 * ends with 'test', excluding files starting with 'test-'.
 * Also returns false for any files in node_modules directory.
 */
export function isValidTestFile(uri: URI): boolean {
	return false;
}

export interface InlineCompletionsParams {
	// Context
	document: vscode.TextDocument;
	position: vscode.Position;
	triggerKind: TriggerKind;
	selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined;
	docContext: DocumentContext;
	completionIntent?: CompletionIntent;
	lastAcceptedCompletionItem?: Pick<AutocompleteItem, 'requestParams' | 'analyticsItem'>;

	// Shared
	requestManager: RequestManager;

	// UI state
	lastCandidate?: LastInlineCompletionCandidate;
	debounceInterval?: { singleLine: number; multiLine: number };
	setIsLoading?: (isLoading: boolean) => void;

	// Execution
	abortSignal?: AbortSignal;
	artificialDelay?: number;

	// Feature flags
	completeSuggestWidgetSelection?: boolean;

	// Callbacks to accept completions
	handleDidAcceptCompletionItem?: (
		completion: Pick<AutocompleteItem, 'requestParams' | 'logId' | 'analyticsItem' | 'trackedRange'>
	) => void;
	handleDidPartiallyAcceptCompletionItem?: (
		completion: Pick<AutocompleteItem, 'logId' | 'analyticsItem'>,
		acceptedLength: number
	) => void;

	// sidecar client
	sidecarClient: SideCarClient;
}

/**
 * The last-suggested ghost text result, which can be reused if it is still valid.
 */
export interface LastInlineCompletionCandidate {
	/** The document URI for which this candidate was generated. */
	uri: URI;

	/** The doc context item */
	lastTriggerDocContext: DocumentContext;

	/** The position at which this candidate was generated. */
	lastTriggerPosition: vscode.Position;

	/** The selected info item. */
	lastTriggerSelectedCompletionInfo: vscode.SelectedCompletionInfo | undefined;

	/** The previously suggested result. */
	result: InlineCompletionsResult;
}

/**
 * The result of a call to {@link getInlineCompletions}.
 */
export interface InlineCompletionsResult {
	/** The unique identifier for logging this result. */
	logId: CompletionLogID;

	/** Where this result was generated from. */
	source: InlineCompletionsResultSource;

	/** The completions. */
	items: InlineCompletionItemWithAnalytics[];
}

/**
 * The source of the inline completions result.
 */
export enum InlineCompletionsResultSource {
	Network = 'Network',
	Cache = 'Cache',
	HotStreak = 'HotStreak',
	CacheAfterRequestStart = 'CacheAfterRequestStart',

	/**
	 * The user is typing as suggested by the currently visible ghost text. For example, if the
	 * user's editor shows ghost text `abc` ahead of the cursor, and the user types `ab`, the
	 * original completion should be reused because it is still relevant.
	 *
	 * The last suggestion is passed in {@link InlineCompletionsParams.lastCandidate}.
	 */
	LastCandidate = 'LastCandidate',
}

/**
 * Extends the default VS Code trigger kind to distinguish between manually invoking a completion
 * via the keyboard shortcut and invoking a completion via hovering over ghost text.
 */
export enum TriggerKind {
	/** Completion was triggered explicitly by a user hovering over ghost text. */
	Hover = 'Hover',

	/** Completion was triggered automatically while editing. */
	Automatic = 'Automatic',

	/** Completion was triggered manually by the user invoking the keyboard shortcut. */
	Manual = 'Manual',

	/** When the user uses the suggest widget to cycle through different completions. */
	SuggestWidget = 'SuggestWidget',
}

export async function getInlineCompletions(
	params: InlineCompletionsParams
): Promise<InlineCompletionsResult | null> {
	try {
		const result = await doGetInlineCompletions(params);
		return result;
	} catch (unknownError: unknown) {
		const error = unknownError instanceof Error ? unknownError : new Error(unknownError as any);

		if (process.env.NODE_ENV === 'development') {
			// Log errors to the console in the development mode to see the stack traces with source maps
			// in Chrome dev tools.
			console.error(error);
		}
		console.error('getInlineCompletions:error', error.message, error.stack, { verbose: { error } });

		throw error;
	} finally {
		params.setIsLoading?.(false);
	}
}

async function doGetInlineCompletions(
	params: InlineCompletionsParams
): Promise<InlineCompletionsResult | null> {
	const {
		document,
		position,
		triggerKind,
		selectedCompletionInfo,
		docContext,
		docContext: { multilineTrigger, currentLineSuffix, currentLinePrefix },
		requestManager,
		lastCandidate,
		debounceInterval,
		setIsLoading,
		abortSignal,
		handleDidAcceptCompletionItem,
		handleDidPartiallyAcceptCompletionItem,
		artificialDelay,
		completionIntent,
		lastAcceptedCompletionItem,
		sidecarClient,
	} = params;
	console.log('sidecar.callingInlineCompletions', position.line, position.character);


	// If we have a suffix in the same line as the cursor and the suffix contains any word
	// characters, do not attempt to make a completion. This means we only make completions if
	// we have a suffix in the same line for special characters like `)]}` etc.
	//
	// VS Code will attempt to merge the remainder of the current line by characters but for
	// words this will easily get very confusing.
	if (triggerKind !== TriggerKind.Manual && /\w/.test(currentLineSuffix)) {
		console.log('getInlineCompletions:abort', 'suffixContainsWordCharacters', triggerKind, currentLineSuffix);
		return null;
	}

	// Do not trigger when the last character is a closing symbol
	if (triggerKind !== TriggerKind.Manual && /[);\]}]$/.test(currentLinePrefix.trim())) {
		console.log('getInlineCompletions:abort', 'lastCharacterIsClosingSymbol', triggerKind, currentLinePrefix);
		return null;
	}

	// Do not trigger when cursor is at the start of the file ending line and the line above is empty
	if (
		triggerKind !== TriggerKind.Manual &&
		position.line !== 0 &&
		position.line === document.lineCount - 1
	) {
		const lineAbove = Math.max(position.line - 1, 0);
		if (document.lineAt(lineAbove).isEmptyOrWhitespace && !position.character) {
			return null;
		}
	}

	// Do not trigger when the user just accepted a single-line completion
	if (
		triggerKind !== TriggerKind.Manual &&
		lastAcceptedCompletionItem &&
		lastAcceptedCompletionItem.requestParams.document.uri.toString() === document.uri.toString() &&
		lastAcceptedCompletionItem.requestParams.docContext.multilineTrigger === null
	) {
		const docContextOfLastAcceptedAndInsertedCompletionItem = insertIntoDocContext({
			docContext: lastAcceptedCompletionItem.requestParams.docContext,
			insertText: lastAcceptedCompletionItem.analyticsItem.insertText,
			languageId: lastAcceptedCompletionItem.requestParams.document.languageId,
			dynamicMultilineCompletions: false,
		});
		if (
			docContext.prefix === docContextOfLastAcceptedAndInsertedCompletionItem.prefix &&
			docContext.suffix === docContextOfLastAcceptedAndInsertedCompletionItem.suffix &&
			docContext.position.isEqual(docContextOfLastAcceptedAndInsertedCompletionItem.position)
		) {
			return null;
		}
	}

	// Check if the user is typing as suggested by the last candidate completion (that is shown as
	// ghost text in the editor), and reuse it if it is still valid.
	const resultToReuse =
		triggerKind !== TriggerKind.Manual && lastCandidate
			? reuseLastCandidate({
				document,
				position,
				lastCandidate,
				docContext,
				selectedCompletionInfo,
				handleDidAcceptCompletionItem,
				handleDidPartiallyAcceptCompletionItem,
			})
			: null;
	if (resultToReuse) {
		console.log('sidecar.typingAsSuggested', 'reusingLastCandidate');
		// log the resuleToReuse here
		for (const candidate of resultToReuse.items) {
			console.log('sidecar.reuseResult', candidate.insertText);
		}
		return resultToReuse;
	}

	// Only log a completion as started if it's either served from cache _or_ the debounce interval
	// has passed to ensure we don't log too many start events where we end up not doing any work at
	// all.
	CompletionLogger.flushActiveSuggestionRequests();
	const multiline = Boolean(multilineTrigger);
	const logId = CompletionLogger.create({
		multiline,
		triggerKind,
		languageId: document.languageId,
		testFile: isValidTestFile(document.uri),
		completionIntent,
		artificialDelay,
	});

	// Debounce to avoid firing off too many network requests as the user is still typing.
	const interval =
		((multiline ? debounceInterval?.multiLine : debounceInterval?.singleLine) ?? 0) +
		(artificialDelay ?? 0);
	if (triggerKind === TriggerKind.Automatic && interval !== undefined && interval > 0) {
		await new Promise<void>(resolve => setTimeout(resolve, interval));
	}

	// We don't need to make a request at all if the signal is already aborted after the debounce.
	if (abortSignal?.aborted) {
		return null;
	}

	setIsLoading?.(true);
	CompletionLogger.start(logId);

	if (abortSignal?.aborted) {
		setIsLoading?.(false);
		return null;
	}

	const requestParams: RequestParams = {
		document,
		docContext,
		position,
		selectedCompletionInfo,
		abortSignal,
	};

	const provider = new SidecarProvider(
		{
			id: logId,
			position: requestParams.position,
			document: requestParams.document,
			docContext: requestParams.docContext,
			multiline: true,
			n: 1,
			// we give it a big timeout here, we are going to check
			// if this will still work as we want it to
			firstCompletionTimeout: 5000,
			// we want to enable the hot streak
			hotStreak: true,
			// we want to generate multiline completions
			dynamicMultilineCompletions: true,
		},
		sidecarClient,
	);

	// Get the processed completions from providers
	const { completions, source } = await requestManager.request({
		requestParams,
		isCacheEnabled: triggerKind !== TriggerKind.Manual,
		provider,
	});

	setIsLoading?.(false);

	// log the final completions which are coming from the request manager
	for (const completion of completions) {
		console.log('sidecar.request.manager.completion', completion.insertText);
	}
	console.log('sidecar.request.manager.length', logId, completions.length);

	CompletionLogger.loaded(logId, requestParams, completions, source);

	return {
		logId,
		items: completions,
		source,
	};
}
