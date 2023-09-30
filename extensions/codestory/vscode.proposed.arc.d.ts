/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface ArcProvider {
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<InteractiveWelcomeMessageContent[]>;
	}

	export namespace arc {
		// current version of the proposal.
		export const _version: 1 | number;

		export function registerArcProvider(id: string, provider: ArcProvider): Disposable;
	}
}
