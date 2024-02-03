/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationToken,
	InlineCompletionContext,
	InlineCompletionItem,
	InlineCompletionItemProvider,
	InlineCompletionTriggerKind,
	Position,
	Range,
	TextDocument,
	window,
	workspace,
} from 'vscode';
import { SideCarClient } from '../sidecar/client';

export type CompletionRequest = {
	filepath: string;
	language: string;
	text: string;
	// The cursor position in the editor
	position: {
		line: number;
		character: number;
		byteOffset: number;
	};
	indentation?: string;
	clipboard?: string;
	manually?: boolean;
};

export type CompletionResponseChoice = {
	insertText: string;
	insertRange: {
		startPosition: {
			line: number;
			character: number;
			byteOffset: number;
		};
		endPosition: {
			line: number;
			character: number;
			byteOffset: number;
		};
	}
};

export type CompletionResponse = {
	completions: CompletionResponseChoice[];
}


type DisplayedCompletion = {
	id: string;
	completion: CompletionResponse;
	displayedAt: number;
};

export class SidecarCompletionProvider implements InlineCompletionItemProvider {
	private triggerMode: 'automatic' | 'manual' | 'disabled' = 'automatic';
	private flyingRequestController: AbortController | undefined;
	private loading = false;
	private displayedCompletion: DisplayedCompletion | null = null;
	private _sidecarClient: SideCarClient;

	public constructor(sidecarClient: SideCarClient) {
		this._sidecarClient = sidecarClient;
		this.updateConfiguration();
	}

	private getEditorIndentation(): string | undefined {
		const editor = window.activeTextEditor;
		if (!editor) {
			return undefined;
		}

		const { insertSpaces, tabSize } = editor.options;
		if (insertSpaces && typeof tabSize === 'number' && tabSize > 0) {
			return ' '.repeat(tabSize);
		} else if (!insertSpaces) {
			return '\t';
		}
		return undefined;
	}

	async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<InlineCompletionItem[] | null> {
		console.log('we are calling the inline completion');
		if (token?.isCancellationRequested) {
			return null;
		}
		const request: CompletionRequest = {
			filepath: document.uri.fsPath,
			language: document.languageId, // https://code.visualstudio.com/docs/languages/identifiers
			text: document.getText(),
			position: {
				line: position.line,
				character: position.character,
				byteOffset: document.offsetAt(position),
			},
			indentation: this.getEditorIndentation(),
			manually: context.triggerKind === InlineCompletionTriggerKind.Invoke,
		};

		const abortController = new AbortController();
		this.flyingRequestController = abortController;

		token.onCancellationRequested(() => abortController.abort());

		try {
			this.loading = true;
			console.log('we are doing something here');
			const response = await this._sidecarClient.inlineCompletion(request, abortController.signal);
			this.loading = false;

			if (token?.isCancellationRequested) {
				return null;
			}

			// Now we generate an inline completion item from the response we got
			const inlineCompletions = response.completions.map((choice, index) => {
				const item = new InlineCompletionItem(
					choice.insertText,
					new Range(
						new Position(choice.insertRange.startPosition.line, choice.insertRange.startPosition.character),
						new Position(choice.insertRange.endPosition.line, choice.insertRange.endPosition.character),
					),
				);
				return item;
			});

			return inlineCompletions;
		} catch (error: any) {
			console.log(error);
			if (this.flyingRequestController === abortController) {
				// the request was not replaced by a new request, set loading to false safely
				this.loading = false;
			}
			if (error.name !== 'AbortError') {
				console.debug('Error when providing completions', { error });
			}
		}

		return null;
	}

	private updateConfiguration() {
		if (!workspace.getConfiguration('editor').get('inlineSuggest.enabled', true)) {
			this.triggerMode = 'disabled';
		}
	}

	public handleEvent(
		event: 'show' | 'accept' | 'dismiss' | 'accept_word' | 'accept_line',
		completion?: CompletionResponse,
	) {
		if (event === 'show' && completion) {
			const comparisonId = 'completion-test'.replace('completion-', '');
			const timestamp = Date.now();
			this.displayedCompletion = {
				id: `view-${comparisonId}-at-${timestamp}`,
				completion,
				displayedAt: timestamp,
			};
			this.postEvent(event, this.displayedCompletion);
		} else if (this.displayedCompletion) {
			this.postEvent(event, this.displayedCompletion);
			this.displayedCompletion = null;
		}
	}

	private postEvent(
		event: 'show' | 'accept' | 'dismiss' | 'accept_word' | 'accept_line',
		displayedCompletion: DisplayedCompletion,
	) {
		const { id, completion, displayedAt } = displayedCompletion;
		const elapsed = Date.now() - displayedAt;
		let eventData: { type: string; select_kind?: 'line'; elapsed?: number };
		switch (event) {
			case 'show':
				eventData = { type: 'view' };
				break;
			case 'accept':
				eventData = { type: 'select', elapsed };
				break;
			case 'dismiss':
				eventData = { type: 'dismiss', elapsed };
				break;
			case 'accept_word':
				// select_kind should be 'word' but not supported by Tabby Server yet, use 'line' instead
				eventData = { type: 'select', select_kind: 'line', elapsed };
				break;
			case 'accept_line':
				eventData = { type: 'select', select_kind: 'line', elapsed };
				break;
			default:
				// unknown event type, should be unreachable
				return;
		}
		try {
			// const postBody: LogEventRequest = {
			// 	...eventData,
			// 	completion_id: completion.id,
			// 	// Assume only one choice is provided for now
			// 	choice_index: completion.choices[0]!.index,
			// 	view_id: id,
			// };
			console.debug(`Post event ${event}`, { eventData });
			// agent().postEvent(postBody);
		} catch (error: any) {
			console.debug('Error when posting event', { error });
		}
	}
}
