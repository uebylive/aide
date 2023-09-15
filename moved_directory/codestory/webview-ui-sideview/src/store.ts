/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { create } from 'zustand';

import {
	TimeLineState,
	CheckpointResponse,
	ExplanationState,
	ExplanationData,
	HealthState,
	HealthStatus,
	ChangedCodeSymbolResponse,
	CodeSymbolChange,
	CommitState,
	PageState,
	PageType,
	CodeBlockChangeDescriptionResponse,
	CodeBlockChangeDescription,
	CommitPrepData,
} from './types';

export const usePageStore = create<PageState>((set) => ({
	page: 'home',
	setPage: (newPage: PageType) => set({ page: newPage }),
}));

export const useChangedCodeSymbolsStore = create<ChangedCodeSymbolResponse>((set) => ({
	changedCodeSymbols: [],
	setChangedCodeSymbol: (newChangedCodeSymbols: CodeSymbolChange[]) =>
		set({ changedCodeSymbols: newChangedCodeSymbols }),
}));

export const useChangedCodeBlockChangeDescriptionStore = create<CodeBlockChangeDescriptionResponse>(
	(set) => ({
		codeBlockChangeDescriptions: [],
		setCodeBlockChangeDescriptions: (
			newCodeBlockChangeDescriptions: CodeBlockChangeDescription[]
		) => set({ codeBlockChangeDescriptions: newCodeBlockChangeDescriptions }),
	})
);

export const useTimelineStore = create<TimeLineState>((set) => ({
	changelog: [],
	setChangelog: (newChangeLog: CheckpointResponse) => set({ changelog: newChangeLog }),
}));

export const useExplanationStore = create<ExplanationState>((set) => ({
	explanationData: undefined,
	setExplanationData: (newExplanation: ExplanationData) => set({ explanationData: newExplanation }),
}));

export const useHealthStore = create<HealthState>((set) => ({
	status: 'UNAVAILABLE',
	setStatus: (newStatus: HealthStatus) => set({ status: newStatus }),
}));

export const useCommitStore = create<CommitState>((set) => ({
	commitPrepData: { changedFiles: [], changeDescriptions: [] },
	setCommitPrepData: (newCommitPrepData: CommitPrepData) =>
		set({ commitPrepData: newCommitPrepData }),
}));
