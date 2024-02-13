/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest } from '../../inlineCompletion/sidecarCompletion';
import { SideCarClient } from '../../sidecar/client';
import { forkSignal, zipGenerators } from '../utils';
import * as CompletionLogger from '../logger';
import { FetchCompletionResult, fetchAndProcessCompletions, fetchAndProcessDynamicMultilineCompletions } from './fetch-and-process-completions';
import { Provider, ProviderOptions } from './provider';

export class SidecarProvider extends Provider {
	private _sidecarClient: SideCarClient;
	private _logger: CompletionLogger.LoggingService;
	constructor(options: ProviderOptions, sidecarClient: SideCarClient, logger: CompletionLogger.LoggingService) {
		super(options);
		this._sidecarClient = sidecarClient;
		this._logger = logger;
	}

	public generateCompletions(abortSignal: AbortSignal): AsyncGenerator<FetchCompletionResult[]> {
		const { languageId, uri } = this.options.document;
		const isDynamicMultiline = Boolean(this.options.dynamicMultilineCompletions);
		this._logger.logInfo('sidecar.inlineProvider', {
			'event_name': 'generate_completions',
			'id': this.options.spanId,
		});
		// console.log('sidecar.completion.isDynamicMultiline', isDynamicMultiline);
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
			id: this.options.spanId,
			requestId: this.options.spanId,
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
			logger: this._logger,
			spanId: this.options.spanId,
		});
		return zipGenerators([stream]);
	}
}
