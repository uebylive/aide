/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface SidecarErrorDetails {
		type: 'error';
		message: string;
	}

	export interface SidecarResponse {
		type: 'response';
		response: string;
	}

	export type SidecarResult = SidecarErrorDetails | SidecarResponse;

	export interface CommandPaletteRequest {
		requestId: string;
		query: string;
	}

	export interface AideCommandPaletteResponseHandler {
		provideResponse(request: CommandPaletteRequest, token: CancellationToken): ProviderResult<SidecarResult | void>;
	}

	export namespace aideCommandPalette {
		export const _version: 1 | number;
		export function registerCommandPaletteProvider(id: string, provider: AideCommandPaletteResponseHandler): Disposable;
	}
}
