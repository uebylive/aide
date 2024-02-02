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
		byte_offset: number;
	};
	indentation?: string;
	clipboard?: string;
	manually?: boolean;
};

export type CompletionResponseChoice = {
	index: number;
	text: string;
	// Range of the text to be replaced when applying the completion.
	// The range should be limited to the current line.
	replaceRange: {
		start: number;
		end: number;
	};
};

export type CompletionResponse = {
	id: string;
	choices: CompletionResponseChoice[];
};

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
				byte_offset: document.offsetAt(position),
			},
			indentation: this.getEditorIndentation(),
			manually: context.triggerKind === InlineCompletionTriggerKind.Invoke,
		};

		const abortController = new AbortController();
		this.flyingRequestController = abortController;

		token.onCancellationRequested(() => abortController.abort());

		try {
			this.loading = true;
			const response = await this._sidecarClient.inlineCompletion(request, abortController.signal);
			this.loading = false;

			if (token?.isCancellationRequested) {
				return null;
			}

			return response;
		} catch (error: any) {
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
			const comparisonId = completion.id.replace('cmpl-', '');
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

	public postEvent(event: string, completion?: DisplayedCompletion) {
		// finish this, we have to take it from tabby and then connect it with the
		// sidecar binary so we can send it requests continuously (
		// we also need a loading spinner on the below bar to show that its
		// processing
		// )
		// this._sidecarClient.inlineCompletionEvent(event, completion);
	}
}
