/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { create } from 'zustand';

export const useDebuggingStore = create<{
	exploration: number;
	setExploration: (exploration: number) => void;
}>((set) => ({
	exploration: 0,
	setExploration: (exploration) => set({ exploration }),
}));
