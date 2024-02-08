/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest } from '../../inlineCompletion/sidecarCompletion';
import { SideCarClient } from '../../sidecar/client';
import { forkSignal, zipGenerators } from '../utils';
import { FetchCompletionResult, fetchAndProcessCompletions, fetchAndProcessDynamicMultilineCompletions } from './fetch-and-process-completions';
import { Provider, ProviderOptions } from './provider';

export class SidecarProvider extends Provider {
	private _sidecarClient: SideCarClient;
	constructor(options: ProviderOptions, sidecarClient: SideCarClient) {
		super(options);
		this._sidecarClient = sidecarClient;
	}

	public generateCompletions(abortSignal: AbortSignal): AsyncGenerator<FetchCompletionResult[]> {
		const { languageId, uri } = this.options.document;
		const isDynamicMultiline = Boolean(this.options.dynamicMultilineCompletions);
		console.log('sidecar.completion.isDynamicMultiline', isDynamicMultiline);
		const fetchAndProcessCompletionsImpl = isDynamicMultiline
			? fetchAndProcessDynamicMultilineCompletions
			: fetchAndProcessCompletions;
		// send over the request to the sidecar
		const completionRequest: CompletionRequest = {
			filepath: uri.fsPath,
			language: languageId,
			text: this.options.document.getText(),
			position: {
				line: this.options.position.line,
				character: this.options.position.character,
				byteOffset: this.options.document.offsetAt(this.options.position),
			},
			id: this.options.id,
			requestId: this.options.id,
		};
		const responseStream = this._sidecarClient.inlineCompletionText(
			completionRequest,
			abortSignal,
		);
		const abortController = forkSignal(abortSignal);
		const stream = fetchAndProcessCompletionsImpl({
			completionResponseGenerator: responseStream,
			abortController,
			providerSpecificPostProcess: (insertText: string) => insertText,
			providerOptions: this.options,
		});
		return zipGenerators([stream]);
	}
}
