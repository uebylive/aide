/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IArcProviderContribution {
	id: string;
	label: string;
}

export const IArcContributionService = createDecorator<IArcContributionService>('IArcContributionService');
export interface IArcContributionService {
	readonly _serviceBrand: undefined;

	registerProviders: IArcProviderContribution[];
	registerArcProvider(provider: IArcProviderContribution): void;
	deregisterArcProvider(providerId: string): void;
	getViewIdForProvider(providerId: string): string;
}

export interface IRawArcProviderContribution {
	id: string;
	label: string;
}
