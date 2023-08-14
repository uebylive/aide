/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { create } from 'zustand';
import { AntonData, AntonDataResponse } from './types';

export const useChangedAntonDataStore = create<AntonDataResponse>((set) => ({
	antonData: {
		events: [],
		saveDestination: '',
	},
	setAntonData: (newAntonData: AntonData) => set({ antonData: newAntonData }),
}));
