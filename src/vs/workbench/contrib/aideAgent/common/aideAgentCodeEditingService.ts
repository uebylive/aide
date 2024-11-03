/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IWorkspaceTextEdit } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAideAgentEdits } from './aideAgentEditingSession.js';

export const enum AideAgentCodeEditingSessionState {
	Initial = 0,
	StreamingEdits = 1,
	Idle = 2,
	Disposed = 3
}

export interface IAideAgentCodeEditingSession {
	readonly sessionId: string;
	readonly codeEdits: Map<string, IAideAgentEdits>;
	readonly onDidChange: Event<void>;
	readonly onDidDispose: Event<void>;
	apply(edits: IWorkspaceTextEdit): Promise<void>;
	complete(): void;
	accept(): void;
	acceptUntilExchange(sessionId: string, exchangeId: string, stepIndex: number | undefined): void;
	reject(): void;
	rejectForExchange(sessionId: string, exchangeId: string): Promise<void>;
	fileLocationForEditsMade(sessionId: string, exchangeId: string): Map<URI, Range[]>;
	editsBetweenExchangesInSession(sessionId: string, startExchangeId: string, nextExchangeId: string): Promise<Map<URI, Range[]>>;
	filesChangedForExchange(sessionId: string, exchangeId: string): URI[];
	/**
	 * Will lead to this object getting disposed
	 */
	stop(): Promise<void>;
	dispose(): void;
}

export const IAideAgentCodeEditingService = createDecorator<IAideAgentCodeEditingService>('aideAgentCodeEditingService');
export interface IAideAgentCodeEditingService {
	_serviceBrand: undefined;

	getOrStartCodeEditingSession(sessionId: string): IAideAgentCodeEditingSession;

	/**
	 * Rejects the edits which we might have made for the session and the exchange
	 */
	rejectEditsMadeDuringExchange(sessionId: string, exchangeId: string): void;

	/**
	 * Helper fucntion to check if there are edits associated with the session and the exchange
	 */
	doesExchangeHaveEdits(sessionId: string, exchangeId: string): boolean;

	/**
	 * Gets the edits which have been done from a certain checkpoint in our session
	 * This allows us to get the real changes which are effected by the plan
	 */
	editsBetweenExchanges(sessionId: string, startExchangeId: string, nextExchangeId: string): Promise<Map<URI, Range[]> | undefined>;
}
