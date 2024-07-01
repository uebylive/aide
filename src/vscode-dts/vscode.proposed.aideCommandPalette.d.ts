/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export namespace aideCommandPalette {

		export interface CommandPal {
			provideProbeResponse(request: ProbeRequest, response: ProbeResponseStream, token: CancellationToken): ProviderResult<ProbeResult | void>;
			onDidUserAction: (action: AideProbeUserAction) => void;
		}

		export function registerCommandPaletteProvider(id: string, provider: ProbeResponseHandler): Disposable;
	}
}
