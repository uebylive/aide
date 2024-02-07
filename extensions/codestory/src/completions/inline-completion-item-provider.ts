/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import { getArtificialDelay, resetArtificialDelay, type LatencyFeatureFlags } from './artificial-delay';
import { getCompletionIntent } from './doc-context-getters';
import { FirstCompletionDecorationHandler } from './first-completion-decoration-handler';
import { formatCompletion } from './format-completion';
import { getCurrentDocContext } from './get-current-doc-context';
import {
	getInlineCompletions,
	InlineCompletionsResultSource,
	TriggerKind,
	type LastInlineCompletionCandidate,
} from './get-inline-completions';
import { isCompletionVisible } from './is-completion-visible';
import type { CompletionBookkeepingEvent, CompletionItemID, CompletionLogID } from './logger';
import * as CompletionLogger from './logger';
import { RequestManager, type RequestParams } from './request-manager';
import { getRequestParamsFromLastCandidate } from './reuse-last-candidate';
import {
	analyticsItemToAutocompleteItem,
	suggestedAutocompleteItemsCache,
	updateInsertRangeForVSCode,
	type AutocompleteInlineAcceptedCommandArgs,
	type AutocompleteItem,
} from './suggested-autocomplete-items-cache';
import { completionProviderConfig } from './completion-provider-config';
import { disableLoadingStatus, setLoadingStatus } from '../inlineCompletion/statusBar';
import { SideCarClient } from '../sidecar/client';

interface AutocompleteResult extends vscode.InlineCompletionList {
	logId: CompletionLogID;
	items: AutocompleteItem[];
	/** @deprecated */
	completionEvent?: CompletionBookkeepingEvent;
}

export interface CodeStoryCompletionItemProviderConfig {
	triggerNotice: ((notice: { key: string }) => void) | null;

	// Settings
	formatOnAccept?: boolean;

	// Feature flags
	completeSuggestWidgetSelection?: boolean;

	// Sidecar client
	sidecarClient: SideCarClient;
}

interface CompletionRequest {
	document: vscode.TextDocument;
	position: vscode.Position;
	context: vscode.InlineCompletionContext;
}

export class InlineCompletionItemProvider
	implements vscode.InlineCompletionItemProvider, vscode.Disposable {
	private lastCompletionRequest: CompletionRequest | null = null;
	// This field is going to be set if you use the keyboard shortcut to manually trigger a
	// completion. Since VS Code does not provide a way to distinguish manual vs automatic
	// completions, we use consult this field inside the completion callback instead.
	private lastManualCompletionTimestamp: number | null = null;
	// private reportedErrorMessages: Map<string, number> = new Map()

	private readonly config: Required<CodeStoryCompletionItemProviderConfig>;

	private requestManager: RequestManager;

	/** Mockable (for testing only). */
	protected getInlineCompletions = getInlineCompletions;

	/** Accessible for testing only. */
	protected lastCandidate: LastInlineCompletionCandidate | undefined;

	private lastAcceptedCompletionItem:
		| Pick<AutocompleteItem, 'requestParams' | 'analyticsItem'>
		| undefined;

	private disposables: vscode.Disposable[] = [];

	private isProbablyNewInstall = true;

	private firstCompletionDecoration = new FirstCompletionDecorationHandler();

	private sidecarClient: SideCarClient;

	constructor({
		completeSuggestWidgetSelection = true,
		formatOnAccept = true,
		sidecarClient,
		...config
	}: CodeStoryCompletionItemProviderConfig) {
		this.config = {
			...config,
			sidecarClient,
			completeSuggestWidgetSelection,
			formatOnAccept,
		};
		this.sidecarClient = sidecarClient;

		if (this.config.completeSuggestWidgetSelection) {
			// This must be set to true, or else the suggest widget showing will suppress inline
			// completions. Note that the VS Code proposed API inlineCompletionsAdditions contains
			// an InlineCompletionList#suppressSuggestions field that lets an inline completion
			// provider override this on a per-completion basis. Because that API is proposed, we
			// can't use it and must instead resort to writing to the user's VS Code settings.
			//
			void vscode.workspace
				.getConfiguration()
				.update(
					'editor.inlineSuggest.suppressSuggestions',
					true,
					vscode.ConfigurationTarget.Global
				)
		}

		this.requestManager = new RequestManager(sidecarClient);

		this.disposables.push(
			vscode.commands.registerCommand(
				'codestory.autocomplete.inline.accepted',
				({ aideCompletion }: AutocompleteInlineAcceptedCommandArgs) => {
					void this.handleDidAcceptCompletionItem(aideCompletion);
				}
			)
		);
	}

	private lastCompletionRequestTimestamp = 0;

	public async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token?: vscode.CancellationToken
	): Promise<AutocompleteResult | null> {
		// Update the last request
		const lastCompletionRequest = this.lastCompletionRequest;
		const completionRequest: CompletionRequest = {
			document,
			position,
			context,
		};
		this.lastCompletionRequest = completionRequest;

		const start = performance.now();

		if (!this.lastCompletionRequestTimestamp) {
			this.lastCompletionRequestTimestamp = start;
		}

		const setIsLoading = (isLoading: boolean): void => {
			if (isLoading) {
				// We do not want to show a loading spinner when the user is rate limited to
				// avoid visual churn.
				//
				// We still make the request to find out if the user is still rate limited.
				setLoadingStatus();
			} else {
				disableLoadingStatus();
			}
		};

		const abortController = new AbortController();
		if (token) {
			if (token.isCancellationRequested) {
				abortController.abort();
			}
			token.onCancellationRequested(() => abortController.abort());
		}

		// When the user has the completions popup open and an item is selected that does not match
		// the text that is already in the editor, VS Code will never render the completion.
		if (!currentEditorContentMatchesPopupItem(document, context)) {
			return null;
		}

		let takeSuggestWidgetSelectionIntoAccount = false;
		// Only take the completion widget selection into account if the selection was actively changed
		// by the user
		if (
			this.config.completeSuggestWidgetSelection &&
			lastCompletionRequest &&
			onlyCompletionWidgetSelectionChanged(lastCompletionRequest, completionRequest)
		) {
			takeSuggestWidgetSelectionIntoAccount = true;
		}

		const triggerKind =
			this.lastManualCompletionTimestamp &&
				this.lastManualCompletionTimestamp > Date.now() - 500
				? TriggerKind.Manual
				: context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic
					? TriggerKind.Automatic
					: takeSuggestWidgetSelectionIntoAccount
						? TriggerKind.SuggestWidget
						: TriggerKind.Hover;
		this.lastManualCompletionTimestamp = null;

		const docContext = getCurrentDocContext({
			document,
			position,
			maxPrefixLength: 0.6 * 2048,
			maxSuffixLength: 0.1 * 2048,
			// We ignore the current context selection if completeSuggestWidgetSelection is not enabled
			context: takeSuggestWidgetSelectionIntoAccount ? context : undefined,
			dynamicMultilineCompletions: completionProviderConfig.dynamicMultilineCompletions,
		});

		const completionIntent = getCompletionIntent({
			document,
			position,
			prefix: docContext.prefix,
		});

		const latencyFeatureFlags: LatencyFeatureFlags = {
			user: false,
		};

		const artificialDelay = getArtificialDelay(
			latencyFeatureFlags,
			document.uri.toString(),
			document.languageId,
			completionIntent
		);

		const isLocalProvider = false;
		// TODO(skcd): Enable this again later on when we have better detection model
		// const isLocalProvider = isLocalCompletionsProvider(this.config.providerConfig.identifier)

		try {
			const result = await this.getInlineCompletions({
				document,
				position,
				triggerKind,
				selectedCompletionInfo: context.selectedCompletionInfo,
				docContext,
				requestManager: this.requestManager,
				sidecarClient: this.sidecarClient,
				lastCandidate: this.lastCandidate,
				debounceInterval: {
					singleLine: isLocalProvider ? 75 : 125,
					multiLine: 125,
				},
				setIsLoading,
				abortSignal: abortController.signal,
				handleDidAcceptCompletionItem: this.handleDidAcceptCompletionItem.bind(this),
				handleDidPartiallyAcceptCompletionItem:
					this.unstable_handleDidPartiallyAcceptCompletionItem.bind(this),
				completeSuggestWidgetSelection: takeSuggestWidgetSelectionIntoAccount,
				artificialDelay,
				completionIntent,
				lastAcceptedCompletionItem: this.lastAcceptedCompletionItem,
			});

			// Avoid any further work if the completion is invalidated already.
			if (abortController.signal.aborted) {
				return null;
			}

			if (!result) {
				// Returning null will clear any existing suggestions, thus we need to reset the
				// last candidate.
				this.lastCandidate = undefined;
				return null;
			}

			// Checks if the current line prefix length is less than or equal to the last triggered prefix length
			// If true, that means user has backspaced/deleted characters to trigger a new completion request,
			// meaning the previous result is unwanted/rejected.
			// In that case, we mark the last candidate as "unwanted", remove it from cache, and clear the last candidate
			const currentPrefix = docContext.currentLinePrefix;
			const lastTriggeredPrefix = this.lastCandidate?.lastTriggerDocContext.currentLinePrefix;
			if (
				this.lastCandidate &&
				lastTriggeredPrefix !== undefined &&
				currentPrefix.length < lastTriggeredPrefix.length
			) {
				this.handleUnwantedCompletionItem(
					getRequestParamsFromLastCandidate(document, this.lastCandidate)
				);
			}

			const visibleItems = result.items.filter(item =>
				isCompletionVisible(
					item,
					document,
					position,
					docContext,
					context,
					takeSuggestWidgetSelectionIntoAccount,
					abortController.signal
				)
			);

			// A completion that won't be visible in VS Code will not be returned and not be logged.
			if (visibleItems.length === 0) {
				// Returning null will clear any existing suggestions, thus we need to reset the
				// last candidate.
				this.lastCandidate = undefined;
				CompletionLogger.noResponse(result.logId);
				return null;
			}

			// Since we now know that the completion is going to be visible in the UI, we save the
			// completion as the last candidate (that is shown as ghost text in the editor) so that
			// we can reuse it if the user types in such a way that it is still valid (such as by
			// typing `ab` if the ghost text suggests `abcd`).
			if (result.source !== InlineCompletionsResultSource.LastCandidate) {
				this.lastCandidate = {
					uri: document.uri,
					lastTriggerPosition: position,
					lastTriggerDocContext: docContext,
					lastTriggerSelectedCompletionInfo: context?.selectedCompletionInfo,
					result,
				};
			}

			const autocompleteItems = analyticsItemToAutocompleteItem(
				result.logId,
				document,
				docContext,
				position,
				visibleItems,
				context
			);

			// Store the log ID for each completion item so that we can later map to the selected
			// item from the ID alone
			for (const item of autocompleteItems) {
				suggestedAutocompleteItemsCache.add(item);
			}

			// return `CompletionEvent` telemetry data to the agent command `autocomplete/execute`.
			const autocompleteResult: AutocompleteResult = {
				logId: result.logId,
				items: updateInsertRangeForVSCode(autocompleteItems),
				completionEvent: CompletionLogger.getCompletionEvent(result.logId),
			};

			// Since VS Code has no callback as to when a completion is shown, we assume
			// that if we pass the above visibility tests, the completion is going to be
			// rendered in the UI
			this.unstable_handleDidShowCompletionItem(autocompleteItems[0]);

			return autocompleteResult;
		} catch (error) {
			this.onError(error as Error);
			throw error;
		}
	}

	/**
	 * Callback to be called when the user accepts a completion. For VS Code, this is part of the
	 * action inside the `AutocompleteItem`. Agent needs to call this callback manually.
	 */
	public async handleDidAcceptCompletionItem(
		completionOrItemId:
			| Pick<
				AutocompleteItem,
				'range' | 'requestParams' | 'logId' | 'analyticsItem' | 'trackedRange'
			>
			| CompletionItemID
	): Promise<void> {
		const completion = suggestedAutocompleteItemsCache.get(completionOrItemId);

		if (!completion) {
			return;
		}

		if (this.config.formatOnAccept) {
			await formatCompletion(completion as AutocompleteItem);
		}

		resetArtificialDelay();

		// When a completion is accepted, the lastCandidate should be cleared. This makes sure the
		// log id is never reused if the completion is accepted.
		this.clearLastCandidate();

		// Remove the completion from the network cache
		this.requestManager.removeFromCache(completion.requestParams);

		this.lastAcceptedCompletionItem = completion;

		CompletionLogger.accepted(
			completion.logId,
			completion.requestParams.document,
			completion.analyticsItem,
			completion.trackedRange,
		);
	}

	/**
	 * Called when a suggestion is shown. This API is inspired by the proposed VS Code API of the
	 * same name, it's prefixed with `unstable_` to avoid a clash when the new API goes GA.
	 */
	public unstable_handleDidShowCompletionItem(
		completionOrItemId: Pick<AutocompleteItem, 'logId' | 'analyticsItem'> | CompletionItemID
	): void {
		const completion = suggestedAutocompleteItemsCache.get(completionOrItemId);
		if (!completion) {
			return;
		}

		CompletionLogger.suggested(completion.logId);
	}

	/**
	 * Called when the user partially accepts a completion. This API is inspired by the proposed VS
	 * Code API of the same name, it's prefixed with `unstable_` to avoid a clash when the new API
	 * goes GA.
	 */
	private unstable_handleDidPartiallyAcceptCompletionItem(
		completion: Pick<AutocompleteItem, 'logId' | 'analyticsItem'>,
		acceptedLength: number
	): void {
		CompletionLogger.partiallyAccept(
			completion.logId,
			completion.analyticsItem,
			acceptedLength,
		);
	}

	public async manuallyTriggerCompletion(): Promise<void> {
		await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
		this.lastManualCompletionTimestamp = Date.now();
		await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
	}

	/**
	 * Handles when a completion item was rejected by the user.
	 *
	 * A completion item is marked as rejected/unwanted when:
	 * - pressing backspace on a visible suggestion
	 */
	private handleUnwantedCompletionItem(reqContext: RequestParams): void {
		const completionItem = this.lastCandidate?.result.items[0];
		if (!completionItem) {
			return;
		}

		this.clearLastCandidate();

		this.requestManager.removeFromCache(reqContext);
	}

	/**
	 * The user no longer wishes to see the last candidate and requests a new completion. Note this
	 * is reset by heuristics when new completion requests are triggered and completions are
	 * rejected as a result of that.
	 */
	public clearLastCandidate(): void {
		this.lastCandidate = undefined;
	}

	/**
	 * A callback that is called whenever an error happens. We do not want to flood a users UI with
	 * error messages so every unexpected error is deduplicated by its message and rate limit errors
	 * are only shown once during the rate limit period.
	 */
	private onError(error: Error): void {
		// TODO(philipp-spiess): Bring back this code once we have fewer uncaught errors
		//
		// c.f. https://sourcegraph.slack.com/archives/C05AGQYD528/p1693471486690459
		//
		// const now = Date.now()
		// if (
		//    this.reportedErrorMessages.has(error.message) &&
		//    this.reportedErrorMessages.get(error.message)! + ONE_HOUR >= now
		// ) {
		//    return
		// }
		// this.reportedErrorMessages.set(error.message, now)
		// this.config.statusBar.addError({
		//    title: 'Cody Autocomplete Encountered an Unexpected Error',
		//    description: error.message,
		//    onSelect: () => {
		//        outputChannel.show()
		//    },
		// })
	}

	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

const globalInvocationSequenceForTracer = 0;


// Check if the current text in the editor overlaps with the currently selected
// item in the completion widget.
//
// If it won't VS Code will never show an inline completions.
//
// Here's an example of how to trigger this case:
//
//  1. Type the text `console.l` in a TypeScript file.
//  2. Use the arrow keys to navigate to a suggested method that start with a
//     different letter like `console.dir`.
//  3. Since it is impossible to render a suggestion with `.dir` when the
//     editor already has `.l` in the text, VS Code won't ever render it.
function currentEditorContentMatchesPopupItem(
	document: vscode.TextDocument,
	context: vscode.InlineCompletionContext
): boolean {
	if (context.selectedCompletionInfo) {
		const currentText = document.getText(context.selectedCompletionInfo.range);
		const selectedText = context.selectedCompletionInfo.text;

		if (!selectedText.startsWith(currentText)) {
			return false;
		}
	}
	return true;
}

/**
 * Returns true if the only difference between the two requests is the selected completions info
 * item from the completions widget.
 */
function onlyCompletionWidgetSelectionChanged(
	prev: CompletionRequest,
	next: CompletionRequest
): boolean {
	if (prev.document.uri.toString() !== next.document.uri.toString()) {
		return false;
	}

	if (!prev.position.isEqual(next.position)) {
		return false;
	}

	if (prev.context.triggerKind !== next.context.triggerKind) {
		return false;
	}

	const prevSelectedCompletionInfo = prev.context.selectedCompletionInfo;
	const nextSelectedCompletionInfo = next.context.selectedCompletionInfo;

	if (!prevSelectedCompletionInfo || !nextSelectedCompletionInfo) {
		return false;
	}

	if (!prevSelectedCompletionInfo.range.isEqual(nextSelectedCompletionInfo.range)) {
		return false;
	}

	return prevSelectedCompletionInfo.text !== nextSelectedCompletionInfo.text;
}